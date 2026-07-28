// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  sanitizeAccountDirName,
  cadenceToMs,
  isDue,
  backupFilename,
  fullBackupDirName,
  timestampStamp
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