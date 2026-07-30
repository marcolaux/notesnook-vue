// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { buildManifest } from "@/utils/backup";

// Fakes are built inside `vi.hoisted` so the `vi.mock` factories (which vitest
// hoists above the imports) can close over them without a TDZ — the hoisted
// callback runs before the factories resolve the mocked modules.
const mocks = vi.hoisted(() => {
  const backupFs = {
    listDir: { query: vi.fn(async () => [] as string[]) },
    exists: { query: vi.fn(async () => false) },
    readFileText: { query: vi.fn(async () => "") },
    readFileBytes: { query: vi.fn(async () => new Uint8Array()) },
    writeFileText: { mutate: vi.fn(async () => {}) },
    writeFileBytes: { mutate: vi.fn(async () => {}) },
    ensureDir: { mutate: vi.fn(async () => {}) },
    deleteFile: { mutate: vi.fn(async () => {}) },
    removeDir: { mutate: vi.fn(async () => {}) }
  };
  const desktop = { backupFs };
  const db = {
    backup: {
      import: vi.fn(async () => {}),
      lastBackupTime: vi.fn(async () => undefined)
    },
    attachments: {
      attachment: vi.fn(async () => ({ size: 10, mimeType: "image/png", chunkSize: 524288 }))
    }
  };
  const writeAttachmentBytes = vi.fn(async () => true);
  return { desktop, db, writeAttachmentBytes };
});

vi.mock("@/platform/desktop-bridge", () => ({ desktop: mocks.desktop }));
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => mocks.db,
  getCurrentContext: () => "local"
}));
vi.mock("@/platform/fs", () => ({
  writeAttachmentBytes: mocks.writeAttachmentBytes,
  readAttachmentStream: vi.fn()
}));

import { useBackupsStore } from "@/stores/backup";

const ROOT = "/tmp/nn-backup-root";
const DIR = "local/full/2024-01-01-00-00-00-full";

/** A minimal unencrypted `BackupFile` JSON (single data chunk). */
function chunkJson(idx: number): string {
  return JSON.stringify({
    version: 1,
    type: "node",
    date: idx,
    data: "payload-" + idx,
    hash: "md5-" + idx,
    hash_type: "md5",
    compressed: true,
    encrypted: false
  });
}
function encryptedChunkJson(idx: number): string {
  return JSON.stringify({
    version: 1,
    type: "node",
    date: idx,
    data: { cipher: "c", iv: "i", salt: "s" },
    hash: "md5-" + idx,
    hash_type: "md5",
    compressed: true,
    encrypted: true
  });
}

/** Route `readFileText`/`exists`/`readFileBytes` to canned responses by path. */
function fsByPath(map: Record<string, { text?: string; bytes?: Uint8Array; exists?: boolean }>): void {
  const f = mocks.desktop.backupFs;
  f.exists.query.mockImplementation(async ({ path }: { root: string; path: string }) =>
    map[path]?.exists ?? false
  );
  f.readFileText.query.mockImplementation(async ({ path }: { root: string; path: string }) => {
    const v = map[path]?.text;
    if (v === undefined) throw new Error("ENOENT: " + path);
    return v;
  });
  f.readFileBytes.query.mockImplementation(async ({ path }: { root: string; path: string }) => {
    const v = map[path]?.bytes;
    if (!v) throw new Error("ENOENT: " + path);
    return v;
  });
}

describe("useBackupsStore.restoreFullBackupFromDir", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.db.backup.import.mockClear();
    mocks.db.backup.lastBackupTime.mockClear();
    mocks.db.attachments.attachment.mockClear();
    mocks.writeAttachmentBytes.mockClear();
    mocks.desktop.backupFs.listDir.query.mockClear();
    mocks.desktop.backupFs.exists.query.mockClear();
    mocks.desktop.backupFs.readFileText.query.mockClear();
    mocks.desktop.backupFs.readFileBytes.query.mockClear();
  });

  it("imports data chunks in index order, passes attachmentsKey (no password), writes pool blobs", async () => {
    const b = useBackupsStore();
    mocks.desktop.backupFs.listDir.query.mockResolvedValueOnce([
      ".nnbackup",
      "1-plain-bbb", // intentionally out of order
      "0-plain-aaa",
      "attachments"
    ]);
    fsByPath({
      [`${DIR}/0-plain-aaa`]: { text: chunkJson(0) },
      [`${DIR}/1-plain-bbb`]: { text: chunkJson(1) },
      [`${DIR}/attachments/.attachments_key`]: { text: '{"key":"k","salt":"s"}' },
      [`${DIR}/attachments/manifest.json`]: { exists: true, text: buildManifest(["h1", "h2"]) },
      [`local/attachments/h1`]: { exists: true, bytes: new Uint8Array([1, 2, 3]) },
      [`local/attachments/h2`]: { exists: true, bytes: new Uint8Array([4, 5, 6]) }
    });

    const ok = await b.restoreFullBackupFromDir(ROOT, DIR, {});
    expect(ok).toBe(true);
    expect(b.lastError).toBeNull();

    // Two imports, in chunk-index order (0 before 1).
    expect(mocks.db.backup.import).toHaveBeenCalledTimes(2);
    const calls = mocks.db.backup.import.mock.calls;
    expect((calls[0][0] as { date: number }).date).toBe(0);
    expect((calls[1][0] as { date: number }).date).toBe(1);
    // attachmentsKey passed; password NOT set (unencrypted — exactOptional).
    expect(calls[0][1]).toEqual(expect.objectContaining({ attachmentsKey: { key: "k", salt: "s" } }));
    expect(calls[0][1]).not.toHaveProperty("password");

    // Both blobs written back from the pool.
    expect(mocks.writeAttachmentBytes).toHaveBeenCalledTimes(2);
    const wCalls = mocks.writeAttachmentBytes.mock.calls.map((c) => c[1]);
    expect(wCalls).toEqual(["h1", "h2"]);
  });

  it("encrypted backup without a password → false + lastError, no import", async () => {
    const b = useBackupsStore();
    mocks.desktop.backupFs.listDir.query.mockResolvedValueOnce(["0-plain-aaa"]);
    fsByPath({
      [`${DIR}/0-plain-aaa`]: { text: encryptedChunkJson(0) },
      [`${DIR}/attachments/.attachments_key`]: { text: '{"cipher":"c","iv":"i","salt":"s"}' }
    });
    const ok = await b.restoreFullBackupFromDir(ROOT, DIR, {});
    expect(ok).toBe(false);
    expect(mocks.db.backup.import).not.toHaveBeenCalled();
    expect(b.lastError).toMatch(/encrypted/i);
  });

  it("encrypted backup with a password → password passed to import", async () => {
    const b = useBackupsStore();
    mocks.desktop.backupFs.listDir.query.mockResolvedValueOnce(["0-plain-aaa"]);
    fsByPath({
      [`${DIR}/0-plain-aaa`]: { text: encryptedChunkJson(0) },
      [`${DIR}/attachments/.attachments_key`]: { text: '{"cipher":"c","iv":"i","salt":"s"}' },
      [`${DIR}/attachments/manifest.json`]: { exists: true, text: buildManifest([]) }
    });
    const ok = await b.restoreFullBackupFromDir(ROOT, DIR, { password: "pw" });
    expect(ok).toBe(true);
    expect(mocks.db.backup.import).toHaveBeenCalledWith(
      expect.objectContaining({ encrypted: true }),
      expect.objectContaining({ password: "pw" })
    );
  });

  it("old-layout (no manifest) reads inline blobs from <dir>/attachments", async () => {
    const b = useBackupsStore();
    mocks.desktop.backupFs.listDir.query.mockImplementation(async ({ path }) => {
      if (path === DIR) return ["0-plain-aaa"];
      if (path === `${DIR}/attachments`) return [".attachments_key", "h1", "h2"];
      return [];
    });
    fsByPath({
      [`${DIR}/0-plain-aaa`]: { text: chunkJson(0) },
      [`${DIR}/attachments/.attachments_key`]: { text: '{"key":"k","salt":"s"}' },
      // No manifest → exists false for it; inline blobs present:
      [`${DIR}/attachments/h1`]: { exists: true, bytes: new Uint8Array([1]) },
      [`${DIR}/attachments/h2`]: { exists: true, bytes: new Uint8Array([2]) }
    });
    const ok = await b.restoreFullBackupFromDir(ROOT, DIR, {});
    expect(ok).toBe(true);
    expect(mocks.writeAttachmentBytes.mock.calls.map((c) => c[1])).toEqual(["h1", "h2"]);
  });

  it("tolerates a missing blob (pool + inline absent) — still returns true", async () => {
    const b = useBackupsStore();
    mocks.desktop.backupFs.listDir.query.mockResolvedValueOnce(["0-plain-aaa"]);
    fsByPath({
      [`${DIR}/0-plain-aaa`]: { text: chunkJson(0) },
      [`${DIR}/attachments/.attachments_key`]: { text: '{"key":"k","salt":"s"}' },
      [`${DIR}/attachments/manifest.json`]: { exists: true, text: buildManifest(["h1"]) }
      // h1 absent from both pool and inline → exists false everywhere
    });
    const ok = await b.restoreFullBackupFromDir(ROOT, DIR, {});
    expect(ok).toBe(true);
    expect(mocks.writeAttachmentBytes).not.toHaveBeenCalled();
  });

  it("no data chunks → false + lastError", async () => {
    const b = useBackupsStore();
    mocks.desktop.backupFs.listDir.query.mockResolvedValueOnce([".nnbackup", "attachments"]);
    const ok = await b.restoreFullBackupFromDir(ROOT, DIR, {});
    expect(ok).toBe(false);
    expect(mocks.db.backup.import).not.toHaveBeenCalled();
    expect(b.lastError).toMatch(/no data chunks/i);
  });
});