// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  collectBackupExport,
  formatBackupTime,
  type BackupExportChunk
} from "@/utils/backup";
import { useBackupsStore } from "@/stores/backup";
import type { BackupFile } from "@notesnook-vue/contracts";

/** Build an async generator from a list of chunks (mimics db.backup.export). */
async function* genFrom(
  chunks: BackupExportChunk[]
): AsyncGenerator<BackupExportChunk, void, unknown> {
  for (const c of chunks) yield c;
}

describe("collectBackupExport (pure)", () => {
  it("collects file chunks in order + forwards attachment progress", async () => {
    const chunks: BackupExportChunk[] = [
      { type: "file", path: ".nnbackup", data: "idx" },
      { type: "file", path: "backup.json", data: '{"type":"node"}' },
      { type: "attachment", path: "a/0", hash: "h0", total: 3, current: 1 },
      { type: "attachment", path: "a/1", hash: "h1", total: 3, current: 2 },
      { type: "attachment", path: "a/2", hash: "h2", total: 3, current: 3 }
    ];
    const progress: BackupExportChunk[] = [];
    const result = await collectBackupExport(genFrom(chunks), (p) =>
      progress.push({ type: "attachment", ...p })
    );
    expect(result.files).toEqual([
      { path: ".nnbackup", data: "idx" },
      { path: "backup.json", data: '{"type":"node"}' }
    ]);
    expect(progress.map((p) => p.current)).toEqual([1, 2, 3]);
  });

  it("works with no onProgress callback (partial mode, files only)", async () => {
    const result = await collectBackupExport(
      genFrom([{ type: "file", path: "f", data: "d" }])
    );
    expect(result.files).toHaveLength(1);
  });

  it("returns empty files for an empty generator", async () => {
    const result = await collectBackupExport(genFrom([]));
    expect(result.files).toEqual([]);
  });

  it("propagates a generator rejection (store wraps in try/catch)", async () => {
    async function* bad(): AsyncGenerator<BackupExportChunk, void, unknown> {
      yield { type: "file", path: "f", data: "d" };
      throw new Error("boom");
    }
    await expect(collectBackupExport(bad())).rejects.toThrow("boom");
  });
});

describe("formatBackupTime (pure)", () => {
  it("returns 'Never' for missing/zero timestamp", () => {
    expect(formatBackupTime(undefined)).toBe("Never");
    expect(formatBackupTime(null)).toBe("Never");
    expect(formatBackupTime(0)).toBe("Never");
  });

  it("returns a non-empty string for a real timestamp", () => {
    expect(formatBackupTime(1_700_000_000_000).length).toBeGreaterThan(0);
  });
});

// --- store (fake db.backup) ---

const state = { lastBackup: undefined as number | undefined };

const db = {
  backup: {
    lastBackupTime: vi.fn(async () => state.lastBackup),
    updateBackupTime: vi.fn(async () => {
      state.lastBackup = 1_700_000_000_000;
    }),
    export: vi.fn((_opts: { type: string; encrypt?: boolean; mode?: string }) =>
      genFrom([
        { type: "file", path: ".nnbackup", data: "idx" },
        { type: "file", path: "backup.json", data: '{"type":"node"}' }
      ])
    ),
    import: vi.fn(async (_b: unknown, _o: unknown) => {})
  }
};

vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

describe("useBackupsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    state.lastBackup = undefined;
    db.backup.lastBackupTime.mockClear();
    db.backup.updateBackupTime.mockClear();
    db.backup.export.mockClear();
    db.backup.import.mockClear();
  });

  it("starts with no backup + no error", () => {
    const b = useBackupsStore();
    expect(b.lastBackup).toBeUndefined();
    expect(b.hasBackup).toBe(false);
    expect(b.busy).toBe(false);
    expect(b.progress).toBeNull();
    expect(b.lastError).toBeNull();
  });

  it("refresh reads lastBackupTime from db", async () => {
    state.lastBackup = 1234;
    const b = useBackupsStore();
    await b.refresh();
    expect(db.backup.lastBackupTime).toHaveBeenCalled();
    expect(b.lastBackup).toBe(1234);
    expect(b.hasBackup).toBe(true);
  });

  it("refresh never throws — leaves state intact on db error", async () => {
    state.lastBackup = 1234;
    const b = useBackupsStore();
    await b.refresh();
    expect(b.lastBackup).toBe(1234);
    db.backup.lastBackupTime.mockRejectedValueOnce(new Error("boom"));
    await b.refresh();
    expect(b.lastBackup).toBe(1234); // unchanged
  });

  it("exportBackup collects file chunks, stamps time, refreshes", async () => {
    const b = useBackupsStore();
    const result = await b.exportBackup({ encrypt: false, mode: "partial" });
    expect(db.backup.export).toHaveBeenCalledWith({
      type: "node",
      encrypt: false,
      mode: "partial"
    });
    expect(result?.files).toEqual([
      { path: ".nnbackup", data: "idx" },
      { path: "backup.json", data: '{"type":"node"}' }
    ]);
    expect(db.backup.updateBackupTime).toHaveBeenCalled();
    expect(b.lastBackup).toBe(1_700_000_000_000);
    expect(b.hasBackup).toBe(true);
    expect(b.busy).toBe(false);
    expect(b.progress).toBeNull();
  });

  it("exportBackup defaults to type node + omits unset encrypt/mode (exactOptional)", async () => {
    const b = useBackupsStore();
    await b.exportBackup();
    expect(db.backup.export).toHaveBeenCalledWith({ type: "node" });
  });

  it("exportBackup failure → undefined + lastError set, state unchanged", async () => {
    db.backup.export.mockImplementationOnce(() => {
      async function* g(): AsyncGenerator<BackupExportChunk, void, unknown> {
        throw new Error("export boom");
      }
      return g();
    });
    const b = useBackupsStore();
    const result = await b.exportBackup();
    expect(result).toBeUndefined();
    expect(b.lastError).toBe("export boom");
    expect(b.busy).toBe(false);
  });

  it("exportBackup surfaces attachment progress, then clears it (full mode)", async () => {
    // The onProgress→progress-ref wiring is verified through the pure
    // collectBackupExport test above; here we assert the store resets
    // progress in its finally block even when attachment chunks streamed.
    db.backup.export.mockImplementationOnce(() =>
      genFrom([
        { type: "file", path: "f", data: "d" },
        { type: "attachment", path: "a", hash: "h", total: 2, current: 1 },
        { type: "attachment", path: "a", hash: "h", total: 2, current: 2 }
      ])
    );
    const b = useBackupsStore();
    await b.exportBackup({ mode: "full" });
    expect(db.backup.export).toHaveBeenCalledWith({
      type: "node",
      encrypt: undefined,
      mode: "full"
    });
    expect(b.progress).toBeNull(); // cleared in finally
    expect(b.busy).toBe(false);
  });

  it("importBackup calls db.backup.import + returns true", async () => {
    const b = useBackupsStore();
    const file = { type: "node", version: 1, date: 1 } as unknown as BackupFile;
    const ok = await b.importBackup(file, { password: "pw" });
    expect(db.backup.import).toHaveBeenCalledWith(file, { password: "pw" });
    expect(ok).toBe(true);
    expect(b.lastError).toBeNull();
  });

  it("importBackup failure → false + lastError set", async () => {
    db.backup.import.mockRejectedValueOnce(new Error("bad backup"));
    const b = useBackupsStore();
    const ok = await b.importBackup({} as BackupFile);
    expect(ok).toBe(false);
    expect(b.lastError).toBe("bad backup");
  });

  it("a successful export clears a previous lastError", async () => {
    db.backup.export.mockImplementationOnce(() => {
      async function* g(): AsyncGenerator<BackupExportChunk, void, unknown> {
        throw new Error("first");
      }
      return g();
    });
    const b = useBackupsStore();
    await b.exportBackup();
    expect(b.lastError).toBe("first");
    const result = await b.exportBackup();
    expect(result).toBeDefined();
    expect(b.lastError).toBeNull();
  });
});