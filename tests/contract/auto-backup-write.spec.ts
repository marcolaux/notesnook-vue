// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildManifest, MANIFEST_NAME, POOL_DIR } from "@/utils/backup";

// Hoisted fakes so the hoisted `vi.mock` factories can close over them (no TDZ).
const mocks = vi.hoisted(() => {
  // Ordered log of backupFs operations — used to assert the manifest is written
  // BEFORE any blob lands in the pool (the cross-process GC-safety invariant).
  const ops: string[] = [];
  const backupFs = {
    ensureDir: { mutate: vi.fn(async ({ path }: { root: string; path: string }) => {
      ops.push(`ensureDir:${path}`);
    }) },
    writeFileText: { mutate: vi.fn(async ({ path, data }: { root: string; path: string; data: string }) => {
      ops.push(`writeFileText:${path}`);
      // stash the manifest body so the test can assert its contents.
      if (path.endsWith(`attachments/${MANIFEST_NAME}`)) manifestBody = data;
    }) },
    writeFileBytes: { mutate: vi.fn(async ({ path }: { root: string; path: string; data: Uint8Array }) => {
      ops.push(`writeFileBytes:${path}`);
    }) },
    exists: { query: vi.fn(async () => false) },
    readFileText: { query: vi.fn(async () => "") },
    readFileBytes: { query: vi.fn(async () => new Uint8Array()) },
    listDir: { query: vi.fn(async () => [] as string[]) },
    deleteFile: { mutate: vi.fn(async () => {}) },
    removeDir: { mutate: vi.fn(async () => {}) }
  };
  let manifestBody = "";
  // `readAttachmentStream` returns a one-chunk stream for a hash in `cached`,
  // else `undefined` (uncached). Backed by a real ReadableStream so `drainStream`
  // in the store exercises the same path as production.
  const cached = new Set<string>();
  const readAttachmentStream = vi.fn(async (hash: string) => {
    if (!cached.has(hash)) return undefined;
    return new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1, 2, 3]));
        c.close();
      }
    });
  });
  return { desktop: { backupFs }, readAttachmentStream, ops, getManifest: () => manifestBody, cached };
});

vi.mock("@/platform/desktop-bridge", () => ({ desktop: mocks.desktop }));
vi.mock("@/stores/config", () => ({ useConfigStore: () => ({ backupRetentionCount: 5 }) }));
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => ({}),
  getCurrentContext: () => "local",
  resolveHostsForContext: vi.fn()
}));
vi.mock("@/platform/database", () => ({ createDesktopPlatform: vi.fn(), initDatabase: vi.fn() }));
vi.mock("@/platform/local-user", () => ({ ensureLocalUser: vi.fn() }));
vi.mock("@/platform/account-registry", () => ({ listAccounts: vi.fn(), getAccount: vi.fn() }));
vi.mock("@/platform/fs", () => ({
  readAttachmentStream: mocks.readAttachmentStream,
  writeAttachmentBytes: vi.fn()
}));

import { writeFullBackupTree } from "@/stores/auto-backup";

const ROOT = "/tmp/nn-backup-root";
const SAN = "local";

/** A minimal file-chunk set: the `.nnbackup` marker + one data chunk + the
 *  attachments key (the only `attachments/` file chunk core yields). */
function fileChunks(): { path: string; data: string }[] {
  return [
    { path: ".nnbackup", data: "" },
    { path: "0-plain-aaa", data: '{"date":0}' },
    { path: "attachments/.attachments_key", data: '{"key":"k"}' }
  ];
}

function progress(hashes: string[]): { path: string; hash: string; total: number; current: number }[] {
  return hashes.map((hash, i) => ({
    path: `attachments/${hash}`,
    hash,
    total: hashes.length,
    current: i + 1
  }));
}

/** Index in `ops` of the first entry matching `re`. */
function indexOf(re: RegExp): number {
  return mocks.ops.findIndex((o) => re.test(o));
}

describe("writeFullBackupTree (manifest-first + dedup pool)", () => {
  beforeEach(() => {
    mocks.ops.length = 0;
    mocks.cached.clear();
    mocks.desktop.backupFs.exists.query.mockImplementation(async () => false);
    mocks.readAttachmentStream.mockClear();
    mocks.desktop.backupFs.writeFileText.mutate.mockClear();
    mocks.desktop.backupFs.writeFileBytes.mutate.mockClear();
    mocks.desktop.backupFs.exists.query.mockClear();
  });

  it("writes the manifest BEFORE any blob, listing every yielded hash (incl. uncached)", async () => {
    // h1 + h2 cached (stream), h3 uncached (no stream). All three are intended.
    mocks.cached.add("h1").add("h2");
    const res = await writeFullBackupTree(ROOT, SAN, fileChunks(), progress(["h1", "h2", "h3"]));

    // Manifest lists every yielded hash, deduped, in order — including the
    // uncached h3 (it's absent from the pool but restore tolerates that).
    expect(mocks.getManifest()).toBe(buildManifest(["h1", "h2", "h3"]));

    // The manifest write precedes the first blob write (GC-safety invariant).
    const manifestAt = indexOf(/writeFileText:.*attachments\/manifest\.json$/);
    const firstBlobAt = indexOf(/writeFileBytes:/);
    expect(manifestAt).toBeGreaterThanOrEqual(0);
    expect(firstBlobAt).toBeGreaterThanOrEqual(0);
    expect(manifestAt).toBeLessThan(firstBlobAt);

    // Only the two cached blobs were written; h3 (uncached) was not.
    const blobPaths = mocks.desktop.backupFs.writeFileBytes.mutate.mock.calls.map(
      (c) => (c[0] as { path: string }).path
    );
    expect(blobPaths.sort()).toEqual([`${SAN}/${POOL_DIR}/h1`, `${SAN}/${POOL_DIR}/h2`]);

    // Counts: referenced = h1 + h2 (cached), uncached = h3.
    expect(res.referenced).toBe(2);
    expect(res.uncached).toBe(1);
  });

  it("dedup: a hash already in the pool is not re-written but is still listed in the manifest", async () => {
    // h1 already in the pool (exists true) → skip; h2 cached → write.
    mocks.desktop.backupFs.exists.query.mockImplementation(async ({ path }) => path.endsWith(`/h1`));
    mocks.cached.add("h2");
    const res = await writeFullBackupTree(ROOT, SAN, fileChunks(), progress(["h1", "h2"]));

    expect(mocks.getManifest()).toBe(buildManifest(["h1", "h2"]));
    const blobPaths = mocks.desktop.backupFs.writeFileBytes.mutate.mock.calls.map(
      (c) => (c[0] as { path: string }).path
    );
    expect(blobPaths).toEqual([`${SAN}/${POOL_DIR}/h2`]); // h1 skipped (dedup)
    expect(res.referenced).toBe(2); // both referenced (h1 already present, h2 written)
  });

  it("writes file chunks at their own paths (marker + data + .attachments_key)", async () => {
    mocks.cached.add("h1");
    await writeFullBackupTree(ROOT, SAN, fileChunks(), progress(["h1"]));
    const textPaths = mocks.desktop.backupFs.writeFileText.mutate.mock.calls.map(
      (c) => (c[0] as { path: string }).path
    );
    // Substring checks — the dir stamp is time-dependent.
    expect(textPaths.some((p) => p.endsWith("/.nnbackup"))).toBe(true);
    expect(textPaths.some((p) => p.endsWith("/0-plain-aaa"))).toBe(true);
    expect(textPaths.some((p) => p.endsWith("/attachments/.attachments_key"))).toBe(true);
  });
});