// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  sanitizeAccountDirName,
  cadenceToMs,
  isDue,
  backupFilename,
  fullBackupDirName,
  timestampStamp,
  buildManifest,
  parseManifest,
  isDataChunkName,
  dataChunkIndex,
  referencedHashes,
  gcPlan,
  buildBackupNotificationBody,
  relativeChild,
  type TranslateFn
} from "@/utils/backup";
import { safeChild } from "../../apps/desktop/src/main/backup-fs";

const DAY = 24 * 60 * 60 * 1000;

describe("sanitizeAccountDirName (pure)", () => {
  it("lower-cases and keeps the safe charset", () => {
    expect(sanitizeAccountDirName("User@Example.com")).toBe("user@example.com");
    expect(sanitizeAccountDirName("a.b+c-d_e")).toBe("a.b+c-d_e");
  });

  it("replaces unsafe characters with underscore", () => {
    expect(sanitizeAccountDirName("a b/c")).toBe("a_b_c");
    expect(sanitizeAccountDirName("héllo@wörld")).toBe("h_llo@w_rld");
  });

  it("strips leading/trailing dots, dashes, underscores", () => {
    expect(sanitizeAccountDirName(".foo.")).toBe("foo");
    expect(sanitizeAccountDirName("--bar__")).toBe("bar");
    expect(sanitizeAccountDirName("_-baz-_")).toBe("baz");
  });

  it("falls back to 'user' for empty / all-stripped input", () => {
    expect(sanitizeAccountDirName("")).toBe("user");
    expect(sanitizeAccountDirName("...")).toBe("user");
    expect(sanitizeAccountDirName("   ")).toBe("user");
  });

  it("guards Windows reserved names (lower-cased, like the rest of the name)", () => {
    expect(sanitizeAccountDirName("CON")).toBe("_con");
    expect(sanitizeAccountDirName("PRN")).toBe("_prn");
    expect(sanitizeAccountDirName("com1")).toBe("_com1");
  });

  it("clamps to 128 chars (stripping a trailing separator run)", () => {
    const long = "a".repeat(200);
    const out = sanitizeAccountDirName(long);
    expect(out.length).toBeLessThanOrEqual(128);
    expect(out.length).toBe(128);
    // Deterministic: same input → same output.
    expect(sanitizeAccountDirName(long)).toBe(out);
  });
});

describe("cadenceToMs (pure)", () => {
  it("maps 1→daily, 2→weekly, 3→monthly", () => {
    expect(cadenceToMs(1)).toBe(DAY);
    expect(cadenceToMs(2)).toBe(7 * DAY);
    expect(cadenceToMs(3)).toBe(30 * DAY);
  });

  it("returns null for 0 (never) and unknown values", () => {
    expect(cadenceToMs(0)).toBeNull();
    expect(cadenceToMs(4)).toBeNull();
    expect(cadenceToMs(-1)).toBeNull();
    expect(cadenceToMs(NaN)).toBeNull();
  });
});

describe("isDue (pure)", () => {
  const now = 1_700_000_000_000;

  it("null cadence → never due (disabled)", () => {
    expect(isDue(undefined, null, now)).toBe(false);
    expect(isDue("2020-01-01T00:00:00.000Z", null, now)).toBe(false);
  });

  it("missing last-run → due (first run)", () => {
    expect(isDue(undefined, DAY, now)).toBe(true);
  });

  it("recent last-run → not due", () => {
    const recent = new Date(now - 1000).toISOString();
    expect(isDue(recent, DAY, now)).toBe(false);
  });

  it("overdue last-run → due", () => {
    const old = new Date(now - 2 * DAY).toISOString();
    expect(isDue(old, DAY, now)).toBe(true);
  });

  it("exactly one cadence ago → due (>=)", () => {
    const exact = new Date(now - DAY).toISOString();
    expect(isDue(exact, DAY, now)).toBe(true);
  });

  it("corrupt stamp → due (re-run + overwrite)", () => {
    expect(isDue("not-a-date", DAY, now)).toBe(true);
  });
});

describe("backup filename / dir naming (pure)", () => {
  it("partial filename is a sortable .nnbackup", () => {
    const f = backupFilename("partial");
    expect(f).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.nnbackup$/);
    expect(f.endsWith("-full.nnbackup")).toBe(false);
  });

  it("full filename carries the -full suffix", () => {
    const f = backupFilename("full");
    expect(f).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-full\.nnbackup$/);
  });

  it("fullBackupDirName is the sortable -full dir (no .nnbackup)", () => {
    const d = fullBackupDirName();
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-full$/);
    expect(d.endsWith(".nnbackup")).toBe(false);
  });

  it("timestampStamp is lexicographically sortable (same length, zero-padded)", () => {
    const a = timestampStamp(new Date(2024, 0, 5, 3, 4, 5));
    const b = timestampStamp(new Date(2024, 11, 31, 23, 59, 59));
    expect(a).toBe("2024-01-05-03-04-05");
    expect(b).toBe("2024-12-31-23-59-59");
    expect(a < b).toBe(true);
  });
});

describe("safeChild (containment guard)", () => {
  const root = "/tmp/nn-backup-root";

  it("resolves a nested subpath inside root", () => {
    const child = safeChild(root, "local/partial/2024-01-01-00-00-00.nnbackup");
    expect(child.startsWith(root + "/")).toBe(true);
  });

  it("rejects a parent-traversal escape", () => {
    expect(() => safeChild(root, "../escape")).toThrow(/escapes backup directory/);
    expect(() => safeChild(root, "local/../../escape")).toThrow(/escapes backup directory/);
  });

  it("rejects an absolute path outside root", () => {
    expect(() => safeChild(root, "/etc/passwd")).toThrow(/escapes backup directory/);
  });

  it("accepts the root itself (empty-ish relative path)", () => {
    // resolve(root, ".") === root; child === rootResolved is allowed.
    expect(safeChild(root, ".")).toBe(root);
  });
});

describe("manifest build/parse (pure)", () => {
  it("round-trips a hash list", () => {
    const text = buildManifest(["h1", "h2", "h3"]);
    expect(parseManifest(text)).toEqual(["h1", "h2", "h3"]);
  });

  it("round-trips an empty list", () => {
    expect(parseManifest(buildManifest([]))).toEqual([]);
  });

  it("tolerates garbage / empty / missing-hashes → []", () => {
    expect(parseManifest("not json")).toEqual([]);
    expect(parseManifest("")).toEqual([]);
    expect(parseManifest("{}")).toEqual([]);
    expect(parseManifest('{"hashes": 3}')).toEqual([]);
    expect(parseManifest('{"other": 1}')).toEqual([]);
  });

  it("drops non-string hash entries", () => {
    expect(parseManifest('{"hashes": ["a", 1, null, "b"]}')).toEqual(["a", "b"]);
  });
});

describe("data-chunk name helpers (pure)", () => {
  it("isDataChunkName accepts plain/encrypted indexed chunks", () => {
    expect(isDataChunkName("0-plain-abc")).toBe(true);
    expect(isDataChunkName("12-encrypted-def")).toBe(true);
    // A real data chunk always has an md5 after the last dash.
    expect(isDataChunkName("0-plain-")).toBe(false);
  });

  it("isDataChunkName rejects marker / key / manifest / garbage", () => {
    expect(isDataChunkName(".nnbackup")).toBe(false);
    expect(isDataChunkName("attachments/.attachments_key")).toBe(false);
    expect(isDataChunkName("manifest.json")).toBe(false);
    expect(isDataChunkName("foo")).toBe(false);
    expect(isDataChunkName("plain-abc")).toBe(false);
  });

  it("dataChunkIndex parses the leading index", () => {
    expect(dataChunkIndex("0-plain-x")).toBe(0);
    expect(dataChunkIndex("10-encrypted-y")).toBe(10);
    expect(Number.isNaN(dataChunkIndex("foo"))).toBe(true);
  });

  it("sorts data chunks by numeric index (not lexicographically)", () => {
    const names = ["10-encrypted-y", "2-plain-x", "0-plain-a", "1-plain-b"];
    const sorted = names
      .filter(isDataChunkName)
      .sort((a, b) => dataChunkIndex(a) - dataChunkIndex(b));
    expect(sorted).toEqual(["0-plain-a", "1-plain-b", "2-plain-x", "10-encrypted-y"]);
  });
});

describe("referencedHashes + gcPlan (pure)", () => {
  it("referencedHashes unions across manifests", () => {
    const set = referencedHashes([buildManifest(["h1", "h2"]), buildManifest(["h2", "h3"])]);
    expect(set).toEqual(new Set(["h1", "h2", "h3"]));
  });

  it("referencedHashes ignores empty/garbage manifests", () => {
    expect(referencedHashes(["", "garbage", buildManifest(["h1"])])).toEqual(new Set(["h1"]));
    expect(referencedHashes([])).toEqual(new Set());
  });

  it("gcPlan keeps all pool blobs when every blob is referenced", () => {
    const plan = gcPlan(["h1", "h2", "h3"], [buildManifest(["h1"]), buildManifest(["h2", "h3"])]);
    expect(plan.keep.sort()).toEqual(["h1", "h2", "h3"]);
    expect(plan.remove).toEqual([]);
  });

  it("gcPlan removes unreferenced pool blobs", () => {
    const plan = gcPlan(["h1", "h2", "h3"], [buildManifest(["h1"])]);
    expect(plan.keep).toEqual(["h1"]);
    expect(plan.remove.sort()).toEqual(["h2", "h3"]);
  });

  it("gcPlan removes everything when no manifest references anything (all old-layout)", () => {
    const plan = gcPlan(["h1"], []);
    expect(plan.keep).toEqual([]);
    expect(plan.remove).toEqual(["h1"]);
  });

  it("gcPlan tolerates a missing manifest alongside a present one", () => {
    const plan = gcPlan(["h1", "h2"], ["", buildManifest(["h1"])]);
    expect(plan.keep).toEqual(["h1"]);
    expect(plan.remove).toEqual(["h2"]);
  });
});

describe("buildBackupNotificationBody (pure)", () => {
  /** A fake `t` that records the key + named params so the body logic is
   *  testable without the i18n instance. */
  function fakeT(): TranslateFn & { calls: { key: string; named?: Record<string, unknown> }[] } {
    const calls: { key: string; named?: Record<string, unknown> }[] = [];
    const fn = ((key: string, named?: Record<string, unknown>) => {
      calls.push({ key, named });
      return named ? `${key}:${JSON.stringify(named)}` : key;
    }) as TranslateFn & { calls: typeof calls };
    fn.calls = calls;
    return fn;
  }

  it("partial → notes-only body (no attachment calls)", () => {
    const t = fakeT();
    const body = buildBackupNotificationBody("partial", undefined, t);
    expect(body).toBe("settings.backup.notifyBodyPartial");
    expect(t.calls).toEqual([{ key: "settings.backup.notifyBodyPartial" }]);
  });

  it("full with all attachments cached → included line only", () => {
    const t = fakeT();
    const body = buildBackupNotificationBody("full", { referenced: 5, uncached: 0 }, t);
    expect(body).toBe('settings.backup.notifyBodyFull:{"n":5}');
    expect(t.calls.map((c) => c.key)).toEqual(["settings.backup.notifyBodyFull"]);
  });

  it("full with uncached attachments → included line + skipped suffix", () => {
    const t = fakeT();
    const body = buildBackupNotificationBody("full", { referenced: 5, uncached: 2 }, t);
    expect(body).toBe('settings.backup.notifyBodyFull:{"n":5} settings.backup.notifyBodySkipped:{"n":2}');
    expect(t.calls.map((c) => c.key)).toEqual([
      "settings.backup.notifyBodyFull",
      "settings.backup.notifyBodySkipped"
    ]);
  });

  it("full with no counts → treats referenced/uncached as 0 (included line only)", () => {
    const t = fakeT();
    const body = buildBackupNotificationBody("full", undefined, t);
    expect(body).toBe('settings.backup.notifyBodyFull:{"n":0}');
    expect(t.calls.map((c) => c.key)).toEqual(["settings.backup.notifyBodyFull"]);
  });
});

describe("relativeChild (pure, cross-platform)", () => {
  it("resolves a POSIX child path with forward slashes", () => {
    expect(relativeChild("/Users/m/Backups", "/Users/m/Backups/local/full/x-full")).toBe(
      "local/full/x-full"
    );
  });

  it("resolves a Windows child path (backslashes → forward slashes)", () => {
    expect(
      relativeChild(
        "C:\\Users\\m\\Backups",
        "C:\\Users\\m\\Backups\\local\\full\\x-full"
      )
    ).toBe("local/full/x-full");
  });

  it("returns null when the path is outside root", () => {
    expect(relativeChild("/a/b", "/a/c/x-full")).toBeNull();
    expect(relativeChild("C:\\Backups", "D:\\Other\\x-full")).toBeNull();
  });

  it("returns null when the path is root itself", () => {
    expect(relativeChild("/a/b", "/a/b")).toBeNull();
  });

  it("tolerates a trailing slash on either side", () => {
    expect(relativeChild("/a/b/", "/a/b/c")).toBe("c");
    expect(relativeChild("/a/b", "/a/b/c/")).toBe("c");
  });
});