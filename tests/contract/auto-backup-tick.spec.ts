// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { LOCAL_CONTEXT } from "@/platform/account-context";
import { buildManifest, MANIFEST_NAME, POOL_DIR } from "@/utils/backup";

// Hoisted fakes so the hoisted `vi.mock` factories can close over them (no TDZ).
// The factories read LIVE state via the returned getters/setters, so per-test
// mutation is just `mocks.setExport(...)` etc. — no re-mocking needed.
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
  const notifications = { show: { mutate: vi.fn(async () => {}) } };
  const desktop = { backupFs, notifications };

  // Per-test live state (closed over by the mock factories below).
  let exportFiles: { path: string; data: string }[] = [];
  let exportProgress: { path: string; hash: string; total: number; current: number }[] = [];
  let accounts: { contextId: string }[] = [];
  let initThrows = false;

  // The mock DB: `backup.export` returns an async generator the store drains.
  const db = {
    backup: {
      export: vi.fn((_opts: unknown) => makeExport(exportFiles, exportProgress)),
      lastBackupTime: vi.fn(async () => undefined)
    },
    attachments: {
      attachment: vi.fn(async () => ({ size: 10, mimeType: "image/png", chunkSize: 524288 }))
    }
  };

  // Mutable per-test config state (the store reads it via `useConfigStore()`).
  const config = {
    backupDirectory: "/tmp/nn-backup-root" as string | null,
    backupReminderOffset: 0,
    fullBackupReminderOffset: 0,
    encryptBackups: false,
    backupRetentionCount: 5
  };

  // `readAttachmentStream` returns a one-chunk stream for a hash in `cached`,
  // else `undefined` (uncached) — backed by a real ReadableStream so the store
  // exercises the same `drainStream` path as production.
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

  return {
    desktop,
    db,
    config,
    cached,
    readAttachmentStream,
    setExport: (
      f: { path: string; data: string }[],
      p: { path: string; hash: string; total: number; current: number }[] = []
    ) => {
      exportFiles = f;
      exportProgress = p;
    },
    setAccounts: (a: { contextId: string }[]) => {
      accounts = a;
    },
    setInitThrows: (v: boolean) => {
      initThrows = v;
    },
    getAccounts: () => accounts,
    getInitThrows: () => initThrows
  };
});

/** An async generator mimicking `db.backup.export`: yields `file` chunks then
 *  `attachment` progress chunks. The store's `collectBackupExport` drains it. */
async function* makeExport(
  files: { path: string; data: string }[],
  progress: { path: string; hash: string; total: number; current: number }[]
) {
  for (const f of files) yield { type: "file" as const, path: f.path, data: f.data };
  for (const p of progress)
    yield { type: "attachment" as const, path: p.path, hash: p.hash, total: p.total, current: p.current };
}

vi.mock("@/platform/desktop-bridge", () => ({ desktop: mocks.desktop }));
vi.mock("@/stores/config", () => ({ useConfigStore: () => mocks.config }));
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => mocks.db,
  getCurrentContext: () => LOCAL_CONTEXT,
  resolveHostsForContext: vi.fn()
}));
vi.mock("@/platform/database", () => ({
  createDesktopPlatform: vi.fn(),
  initDatabase: vi.fn(async () => {
    if (mocks.getInitThrows()) throw new Error("openAccountDb boom");
    return mocks.db;
  })
}));
vi.mock("@/platform/local-user", () => ({ ensureLocalUser: vi.fn() }));
vi.mock("@/platform/account-registry", () => ({
  listAccounts: vi.fn(async () => mocks.getAccounts()),
  getAccount: vi.fn(async () => ({ email: "user@example.com" }))
}));
vi.mock("@/platform/fs", () => ({
  readAttachmentStream: mocks.readAttachmentStream,
  writeAttachmentBytes: vi.fn()
}));
vi.mock("@/i18n", () => ({ default: { global: { t: (k: string) => k } } }));
vi.mock("@/utils/logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { useAutoBackupStore, resetAutoBackupInitForTests } from "@/stores/auto-backup";
import { listAccounts } from "@/platform/account-registry";

const ROOT = "/tmp/nn-backup-root";
const STAMP_PARTIAL = "notesnook.autobackup.local.partial";
const STAMP_FULL = "notesnook.autobackup.local.full";

/** File-chunk fixtures the export yields. */
function filesPartial(): { path: string; data: string }[] {
  return [
    { path: ".nnbackup", data: "" },
    { path: "0-plain-aaa", data: '{"date":0}' }
  ];
}
function filesPartialMulti(): { path: string; data: string }[] {
  return [
    { path: ".nnbackup", data: "" },
    { path: "0-plain-aaa", data: '{"date":0}' },
    { path: "1-plain-bbb", data: '{"date":1}' }
  ];
}
function filesFull(): { path: string; data: string }[] {
  return [
    { path: ".nnbackup", data: "" },
    { path: "0-plain-aaa", data: '{"date":0}' },
    { path: "attachments/.attachments_key", data: '{"key":"k"}' }
  ];
}
function progressFull(): { path: string; hash: string; total: number; current: number }[] {
  return [{ path: "attachments/h1", hash: "h1", total: 1, current: 1 }];
}

/** A minimal in-memory `localStorage` (node env has none) for the scheduler's
 *  per-context per-mode last-run stamps. Cleared per test. */
function freshLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (_i: number) => null,
    get length() {
      return store.size;
    }
  } as Storage;
}

function pathsWritten(): string[] {
  return mocks.desktop.backupFs.writeFileText.mutate.mock.calls.map(
    (c) => (c[0] as { path: string }).path
  );
}
function bytesWritten(): string[] {
  return mocks.desktop.backupFs.writeFileBytes.mutate.mock.calls.map(
    (c) => (c[0] as { path: string }).path
  );
}
function listDirPaths(): string[] {
  return mocks.desktop.backupFs.listDir.query.mock.calls.map((c) => (c[0] as { path: string }).path);
}

describe("auto-backup scheduler orchestration (tick / backupContext / backupNowFull)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetAutoBackupInitForTests();
    vi.stubGlobal("localStorage", freshLocalStorage());

    // Reset per-test live state to defaults (Local-only, both cadences off).
    mocks.config.backupDirectory = ROOT;
    mocks.config.backupReminderOffset = 0;
    mocks.config.fullBackupReminderOffset = 0;
    mocks.config.encryptBackups = false;
    mocks.config.backupRetentionCount = 5;
    mocks.cached.clear();
    mocks.setExport([], []);
    mocks.setAccounts([]);
    mocks.setInitThrows(false);

    // Clear mock call history.
    for (const m of Object.values(mocks.desktop.backupFs)) {
      (m as { query?: { mockClear: () => void }; mutate?: { mockClear: () => void } }).query?.mockClear();
      (m as { mutate?: { mockClear: () => void } }).mutate?.mockClear();
    }
    mocks.desktop.notifications.show.mutate.mockClear();
    mocks.db.backup.export.mockClear();
    vi.mocked(listAccounts).mockClear();
    mocks.readAttachmentStream.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // --- tick short-circuits -------------------------------------------------

  it("tick: no backupDirectory configured → no work, no accounts enumerated", async () => {
    mocks.config.backupDirectory = null;
    const auto = useAutoBackupStore();
    await auto.tick();
    expect(listAccounts).not.toHaveBeenCalled();
    expect(mocks.desktop.backupFs.writeFileText.mutate).not.toHaveBeenCalled();
    expect(auto.busy).toBe(false);
    expect(auto.lastTickAt).toBeNull();
  });

  it("tick: both cadences disabled (Never) → enumerates but backs up nothing", async () => {
    mocks.config.backupReminderOffset = 0;
    mocks.config.fullBackupReminderOffset = 0;
    const auto = useAutoBackupStore();
    await auto.tick();
    // Contexts were enumerated (listAccounts called) but no backup written.
    expect(listAccounts).toHaveBeenCalled();
    expect(mocks.desktop.backupFs.writeFileText.mutate).not.toHaveBeenCalled();
    expect(mocks.desktop.notifications.show.mutate).not.toHaveBeenCalled();
    expect(localStorage.getItem(STAMP_PARTIAL)).toBeNull();
  });

  // --- per-context isolation ----------------------------------------------

  it("tick: one context throwing never aborts the tick or skips Local", async () => {
    // Local due (daily, no prior stamp); an account ctx whose openAccountDb throws.
    mocks.config.backupReminderOffset = 1; // daily → due
    mocks.setExport(filesPartial(), []);
    mocks.setAccounts([{ contextId: "acct-1" }]);
    mocks.setInitThrows(true); // initDatabase throws for the non-active account ctx

    const auto = useAutoBackupStore();
    await auto.tick();

    // Local's partial was written (it runs first, before the failing account).
    expect(pathsWritten().some((p) => p.startsWith("local/partial/"))).toBe(true);
    // Local was stamped; the tick completed despite the account failure.
    expect(localStorage.getItem(STAMP_PARTIAL)).not.toBeNull();
    expect(auto.lastTickAt).not.toBeNull();
    expect(auto.lastError).toBeNull(); // per-context catch swallowed the account error
  });

  // --- partial: success + the created-gate refusal -------------------------

  it("tick: partial success writes the file, stamps, rotates, and notifies", async () => {
    mocks.config.backupReminderOffset = 1; // daily → due (no prior stamp)
    mocks.setExport(filesPartial(), []);
    const auto = useAutoBackupStore();
    await auto.tick();

    expect(pathsWritten().some((p) => p.startsWith("local/partial/"))).toBe(true);
    // Rotation ran (listed the partial dir) — nothing to delete with an empty dir.
    expect(listDirPaths().some((p) => p === "local/partial")).toBe(true);
    expect(localStorage.getItem(STAMP_PARTIAL)).not.toBeNull();
    expect(mocks.desktop.notifications.show.mutate).toHaveBeenCalledTimes(1);
  });

  it("tick: a multi-chunk partial is refused — no stamp / rotate / notify (created gate)", async () => {
    mocks.config.backupReminderOffset = 1;
    mocks.setExport(filesPartialMulti(), []); // 2 data chunks → writePartialBackup refuses
    const auto = useAutoBackupStore();
    await auto.tick();

    // Nothing written, no ensureDir for the partial dir (ensureDir moved past
    // the empty/multi-chunk checks), no stamp, no notification — the next tick
    // retries because the cadence stays unsatisfied.
    expect(mocks.desktop.backupFs.writeFileText.mutate).not.toHaveBeenCalled();
    expect(mocks.desktop.backupFs.ensureDir.mutate).not.toHaveBeenCalled();
    expect(localStorage.getItem(STAMP_PARTIAL)).toBeNull();
    expect(mocks.desktop.notifications.show.mutate).not.toHaveBeenCalled();
    // The tick itself still completed (refusal is not a throw).
    expect(auto.lastTickAt).not.toBeNull();
  });

  // --- full: success path --------------------------------------------------

  it("tick: full success writes manifest + pool blob, runs GC, stamps full, notifies", async () => {
    mocks.config.fullBackupReminderOffset = 1; // daily → due
    mocks.setExport(filesFull(), progressFull());
    mocks.cached.add("h1"); // h1 is locally cached → its blob is written to the pool

    const auto = useAutoBackupStore();
    await auto.tick();

    // Manifest + blob both written (manifest-first ordering is covered in
    // auto-backup-write.spec.ts; here we just confirm the orchestration reaches
    // both for a full tick).
    expect(pathsWritten().some((p) => p.endsWith(`attachments/${MANIFEST_NAME}`))).toBe(true);
    expect(bytesWritten()).toContain(`local/${POOL_DIR}/h1`);
    // The data chunk + .attachments_key landed at their own paths.
    expect(pathsWritten().some((p) => p.endsWith("/0-plain-aaa"))).toBe(true);
    expect(pathsWritten().some((p) => p.endsWith("/attachments/.attachments_key"))).toBe(true);
    // The manifest lists the intended hash.
    const manifestCall = mocks.desktop.backupFs.writeFileText.mutate.mock.calls.find((c) =>
      (c[0] as { path: string }).path.endsWith(`attachments/${MANIFEST_NAME}`)
    );
    expect((manifestCall![0] as { data: string }).data).toBe(buildManifest(["h1"]));
    // Rotation (full dir listed) + GC (pool listed) both ran.
    expect(listDirPaths().some((p) => p === "local/full")).toBe(true);
    expect(listDirPaths().some((p) => p === `local/${POOL_DIR}`)).toBe(true);
    expect(localStorage.getItem(STAMP_FULL)).not.toBeNull();
    expect(mocks.desktop.notifications.show.mutate).toHaveBeenCalledTimes(1);
  });

  // --- backupNowFull -------------------------------------------------------

  it("backupNowFull: success writes the tree, stamps full, and clears busy", async () => {
    mocks.setExport(filesFull(), progressFull());
    mocks.cached.add("h1");
    const auto = useAutoBackupStore();
    const res = await auto.backupNowFull(ROOT, false);
    expect(res).toEqual({ ok: true });
    expect(pathsWritten().some((p) => p.endsWith(`attachments/${MANIFEST_NAME}`))).toBe(true);
    expect(bytesWritten()).toContain(`local/${POOL_DIR}/h1`);
    expect(localStorage.getItem(STAMP_FULL)).not.toBeNull(); // stamps so an imminent tick won't redo
    expect(auto.busy).toBe(false);
  });

  it("backupNowFull: same-process double-fire guard rejects the second call", async () => {
    mocks.setExport(filesFull(), progressFull());
    mocks.cached.add("h1");
    const auto = useAutoBackupStore();
    // Fire twice concurrently: the first awaits the export generator and yields;
    // the second sees `inFlight` and returns ok:false without doing work.
    const [a, b] = await Promise.all([
      auto.backupNowFull(ROOT, false),
      auto.backupNowFull(ROOT, false)
    ]);
    const results = [a, b].sort((x, y) => Number(x.ok) - Number(y.ok));
    expect(results[0].ok).toBe(false);
    expect(results[1].ok).toBe(true);
    expect((results[0] as { error: string }).error).toMatch(/already running/i);
    // Exactly one backup's worth of manifest writes.
    expect(
      mocks.desktop.backupFs.writeFileText.mutate.mock.calls.filter((c) =>
        (c[0] as { path: string }).path.endsWith(`attachments/${MANIFEST_NAME}`)
      )
    ).toHaveLength(1);
    // The guard is released — a subsequent call succeeds.
    expect((await auto.backupNowFull(ROOT, false)).ok).toBe(true);
  });

  it("backupNowFull: an export error returns ok:false, never throws, clears busy + inFlight", async () => {
    mocks.db.backup.export.mockImplementationOnce(() => {
      throw new Error("export boom");
    });
    const auto = useAutoBackupStore();
    const res = await auto.backupNowFull(ROOT, false);
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/export boom/i);
    expect(auto.busy).toBe(false);
    // inFlight released → a follow-up call proceeds (not rejected as "already running").
    mocks.setExport(filesFull(), progressFull());
    mocks.cached.add("h1");
    const follow = await auto.backupNowFull(ROOT, false);
    expect(follow.ok).toBe(true);
  });
});