// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { buildSyncOptions, SYNC_TYPE_LABELS } from "@/utils/sync";
import { useSyncStore } from "@/stores/sync";
import { getCommand, type CommandContext } from "@/commands/registry";
// Importing app-commands registers the app commands (incl. app:sync-now).
import "@/commands/app-commands";

describe("buildSyncOptions (pure)", () => {
  it("defaults type to 'full'", () => {
    expect(buildSyncOptions()).toEqual({ type: "full" });
    expect(buildSyncOptions({})).toEqual({ type: "full" });
  });

  it("passes through type when provided", () => {
    expect(buildSyncOptions({ type: "fetch" })).toEqual({ type: "fetch" });
    expect(buildSyncOptions({ type: "send" })).toEqual({ type: "send" });
  });

  it("only includes force/offlineMode when defined (exactOptional)", () => {
    expect(buildSyncOptions({ force: true })).toEqual({
      type: "full",
      force: true
    });
    expect(buildSyncOptions({ type: "fetch", offlineMode: true })).toEqual({
      type: "fetch",
      offlineMode: true
    });
    expect(buildSyncOptions({ force: false, offlineMode: false })).toEqual({
      type: "full",
      force: false,
      offlineMode: false
    });
  });

  it("never sets undefined for optional keys", () => {
    const opts = buildSyncOptions({ type: "full" });
    expect("force" in opts).toBe(false);
    expect("offlineMode" in opts).toBe(false);
  });
});

describe("SYNC_TYPE_LABELS (pure)", () => {
  it("labels all three sync types", () => {
    expect(SYNC_TYPE_LABELS.full).toBe("Full sync");
    expect(SYNC_TYPE_LABELS.fetch).toBe("Fetch from server");
    expect(SYNC_TYPE_LABELS.send).toBe("Send to server");
  });
});

// --- store (fake db.sync + db.syncer) ---

const syncState = {
  startResult: true as boolean,
  startThrows: false
};

const cancel = vi.fn(async () => {});
const stopFn = vi.fn(async () => {});

const db = {
  sync: vi.fn(async (_opts: unknown) => {
    if (syncState.startThrows) throw new Error("no token");
    return syncState.startResult;
  }),
  syncer: {
    stop: stopFn,
    sync: { cancel }
  }
};

vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

describe("useSyncStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    syncState.startResult = true;
    syncState.startThrows = false;
    db.sync.mockClear();
    stopFn.mockClear();
    cancel.mockClear();
  });

  it("starts idle with no result + no error", () => {
    const s = useSyncStore();
    expect(s.busy).toBe(false);
    expect(s.lastResult).toBeNull();
    expect(s.lastError).toBeNull();
  });

  it("startSync calls db.sync with default full options + returns true", async () => {
    const s = useSyncStore();
    const ok = await s.startSync();
    expect(db.sync).toHaveBeenCalledWith({ type: "full" });
    expect(ok).toBe(true);
    expect(s.lastResult).toBe(true);
    expect(s.busy).toBe(false);
    expect(s.lastError).toBeNull();
  });

  it("startSync forwards type/force/offlineMode via buildSyncOptions", async () => {
    const s = useSyncStore();
    await s.startSync({ type: "fetch", force: true, offlineMode: false });
    expect(db.sync).toHaveBeenCalledWith({
      type: "fetch",
      force: true,
      offlineMode: false
    });
  });

  it("startSync failure → false + lastError set, lastResult false", async () => {
    syncState.startThrows = true;
    const s = useSyncStore();
    const ok = await s.startSync();
    expect(ok).toBe(false);
    expect(s.lastResult).toBe(false);
    expect(s.lastError).toBe("no token");
    expect(s.busy).toBe(false);
  });

  it("startSync surfaces a false result from db.sync (not a throw)", async () => {
    syncState.startResult = false;
    const s = useSyncStore();
    const ok = await s.startSync();
    expect(ok).toBe(false);
    expect(s.lastResult).toBe(false);
    expect(s.lastError).toBeNull(); // not an error, just a false result
  });

  it("stopSync calls db.syncer.stop + returns true", async () => {
    const s = useSyncStore();
    const ok = await s.stopSync();
    expect(stopFn).toHaveBeenCalled();
    expect(ok).toBe(true);
  });

  it("stopSync failure → false + lastError set", async () => {
    stopFn.mockRejectedValueOnce(new Error("stop boom"));
    const s = useSyncStore();
    const ok = await s.stopSync();
    expect(ok).toBe(false);
    expect(s.lastError).toBe("stop boom");
  });

  it("cancelSync calls db.syncer.sync.cancel + returns true", async () => {
    const s = useSyncStore();
    const ok = await s.cancelSync();
    expect(cancel).toHaveBeenCalled();
    expect(ok).toBe(true);
  });

  it("cancelSync failure → false + lastError set", async () => {
    cancel.mockRejectedValueOnce(new Error("cancel boom"));
    const s = useSyncStore();
    const ok = await s.cancelSync();
    expect(ok).toBe(false);
    expect(s.lastError).toBe("cancel boom");
  });

  it("a successful start clears a previous lastError", async () => {
    syncState.startThrows = true;
    const s = useSyncStore();
    await s.startSync();
    expect(s.lastError).toBe("no token");
    syncState.startThrows = false;
    const ok = await s.startSync();
    expect(ok).toBe(true);
    expect(s.lastError).toBeNull();
  });
});

describe("app:sync-now command", () => {
  function stubCtx(showShell: boolean): CommandContext {
    return {
      editor: undefined,
      notes: undefined as unknown as CommandContext["notes"],
      auth: { showShell } as unknown as CommandContext["auth"],
      shell: undefined as unknown as CommandContext["shell"],
      sync: useSyncStore(),
      updater: undefined as unknown as CommandContext["updater"],
      router: undefined as CommandContext["router"],
      closePalette: () => {}
    };
  }

  beforeEach(() => {
    setActivePinia(createPinia());
    syncState.startResult = true;
    syncState.startThrows = false;
    db.sync.mockClear();
  });

  it("is registered", () => {
    expect(getCommand("app:sync-now")).toBeDefined();
  });

  it("visible when the shell is showing, hidden otherwise", () => {
    const cmd = getCommand("app:sync-now")!;
    expect(cmd.when?.(stubCtx(true))).toBe(true);
    expect(cmd.when?.(stubCtx(false))).toBe(false);
  });

  it("run starts a full sync via the sync store", async () => {
    const cmd = getCommand("app:sync-now")!;
    cmd.run(stubCtx(true));
    // startSync is async; let it settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(db.sync).toHaveBeenCalledWith({ type: "full" });
  });
});