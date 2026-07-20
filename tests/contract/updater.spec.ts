// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  classifyUpdatePhase,
  updateStatusText,
  isUpdateAvailable,
  isReadyToInstall
} from "@/utils/updater";
import { useUpdaterStore } from "@/stores/updater";
import { getCommand, type CommandContext } from "@/commands/registry";
import type { UpdateStatus } from "@contracts/router";
// Importing app-commands registers the app commands (incl. app:check-updates).
import "@/commands/app-commands";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const IDLE: UpdateStatus = { available: false, version: null, downloaded: false, progress: 0 };

describe("classifyUpdatePhase (pure)", () => {
  it("returns 'unknown' for null/undefined", () => {
    expect(classifyUpdatePhase(null)).toBe("unknown");
    expect(classifyUpdatePhase(undefined)).toBe("unknown");
  });

  it("returns 'unknown' when no version is known yet", () => {
    expect(classifyUpdatePhase(IDLE)).toBe("unknown");
  });

  it("returns 'available' when an update is found but not downloaded", () => {
    expect(classifyUpdatePhase({ available: true, version: "1.2.3", downloaded: false, progress: 0 })).toBe("available");
  });

  it("returns 'downloading' while progress is between 0 and 100", () => {
    expect(classifyUpdatePhase({ available: true, version: "1.2.3", downloaded: false, progress: 1 })).toBe("downloading");
    expect(classifyUpdatePhase({ available: true, version: "1.2.3", downloaded: false, progress: 99 })).toBe("downloading");
  });

  it("returns 'ready' when downloaded", () => {
    expect(classifyUpdatePhase({ available: true, version: "1.2.3", downloaded: true, progress: 100 })).toBe("ready");
  });

  it("returns 'up-to-date' when a check completed with no available update", () => {
    expect(classifyUpdatePhase({ available: false, version: "1.0.0", downloaded: false, progress: 0 })).toBe("up-to-date");
  });
});

describe("updateStatusText (pure)", () => {
  it("labels each phase", () => {
    expect(updateStatusText(null)).toBe("Checking for updates…");
    expect(updateStatusText(IDLE)).toBe("Checking for updates…");
    expect(updateStatusText({ available: false, version: "1.0.0", downloaded: false, progress: 0 })).toBe("Up to date");
    expect(updateStatusText({ available: true, version: "1.2.3", downloaded: false, progress: 0 })).toBe("Update available (v1.2.3)");
    expect(updateStatusText({ available: true, version: null, downloaded: false, progress: 0 })).toBe("Update available");
    expect(updateStatusText({ available: true, version: "1.2.3", downloaded: false, progress: 42 })).toBe("Downloading… (42%)");
    expect(updateStatusText({ available: true, version: "1.2.3", downloaded: true, progress: 100 })).toBe("Ready to install (v1.2.3)");
    expect(updateStatusText({ available: true, version: null, downloaded: true, progress: 100 })).toBe("Ready to install");
  });
});

describe("isUpdateAvailable / isReadyToInstall (pure)", () => {
  it("available is true only in the 'available' phase", () => {
    expect(isUpdateAvailable({ available: true, version: "1.2.3", downloaded: false, progress: 0 })).toBe(true);
    expect(isUpdateAvailable({ available: true, version: "1.2.3", downloaded: true, progress: 100 })).toBe(false);
    expect(isUpdateAvailable(IDLE)).toBe(false);
  });

  it("ready is true only in the 'ready' phase", () => {
    expect(isReadyToInstall({ available: true, version: "1.2.3", downloaded: true, progress: 100 })).toBe(true);
    expect(isReadyToInstall({ available: true, version: "1.2.3", downloaded: false, progress: 0 })).toBe(false);
    expect(isReadyToInstall(IDLE)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Store (fake desktop.updater bridge)
// ---------------------------------------------------------------------------

// `vi.hoisted` runs before imports (the `vi.mock` factory is hoisted above
// the spec body, so a plain top-level `const bridge` would be uninitialised
// when the factory reads it). The fns are created here and configured per-test.
const { bridge } = vi.hoisted(() => ({
  bridge: {
    check: { query: vi.fn() },
    download: { mutate: vi.fn() },
    install: { mutate: vi.fn() },
    status: { query: vi.fn() }
  }
}));

vi.mock("@/platform/desktop-bridge", () => ({
  desktop: { updater: bridge }
}));

function resetBridge(): void {
  bridge.check.query.mockReset();
  bridge.download.mutate.mockReset();
  bridge.install.mutate.mockReset();
  bridge.status.query.mockReset();
  // Sensible defaults so a test that doesn't care about the bridge value
  // still gets a stable idle snapshot.
  bridge.check.query.mockResolvedValue(IDLE);
  bridge.download.mutate.mockResolvedValue(true);
  bridge.install.mutate.mockResolvedValue(true);
  bridge.status.query.mockResolvedValue(IDLE);
}

describe("useUpdaterStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetBridge();
  });

  it("starts idle (unknown phase, no update, not ready)", () => {
    const u = useUpdaterStore();
    expect(u.busy).toBe(false);
    expect(u.phase).toBe("unknown");
    expect(u.updateAvailable).toBe(false);
    expect(u.readyToInstall).toBe(false);
    expect(u.statusText).toBe("Checking for updates…");
    expect(u.lastError).toBeNull();
  });

  it("checkForUpdates applies the returned status and clears busy", async () => {
    bridge.check.query.mockResolvedValue({ available: true, version: "2.0.0", downloaded: false, progress: 0 });
    const u = useUpdaterStore();
    const ok = await u.checkForUpdates();
    expect(ok).toBe(true);
    expect(u.busy).toBe(false);
    expect(u.status.version).toBe("2.0.0");
    expect(u.updateAvailable).toBe(true);
    expect(u.readyToInstall).toBe(false);
    expect(u.statusText).toBe("Update available (v2.0.0)");
    expect(u.lastError).toBeNull();
  });

  it("checkForUpdates never throws on bridge error (sets lastError, returns false)", async () => {
    bridge.check.query.mockRejectedValue(new Error("offline"));
    const u = useUpdaterStore();
    const ok = await u.checkForUpdates();
    expect(ok).toBe(false);
    expect(u.busy).toBe(false);
    expect(u.lastError).toBe("offline");
  });

  it("downloadUpdate refreshes status after download", async () => {
    bridge.download.mutate.mockResolvedValue(true);
    bridge.status.query.mockResolvedValue({ available: true, version: "2.0.0", downloaded: true, progress: 100 });
    const u = useUpdaterStore();
    const ok = await u.downloadUpdate();
    expect(ok).toBe(true);
    expect(bridge.download.mutate).toHaveBeenCalledTimes(1);
    expect(bridge.status.query).toHaveBeenCalledTimes(1);
    expect(u.readyToInstall).toBe(true);
    expect(u.statusText).toBe("Ready to install (v2.0.0)");
  });

  it("downloadUpdate never throws on bridge error", async () => {
    bridge.download.mutate.mockRejectedValue(new Error("network"));
    bridge.status.query.mockResolvedValue(IDLE);
    const u = useUpdaterStore();
    const ok = await u.downloadUpdate();
    expect(ok).toBe(false);
    expect(u.lastError).toBe("network");
  });

  it("installUpdate forwards to the bridge and returns true", async () => {
    bridge.install.mutate.mockResolvedValue(true);
    const u = useUpdaterStore();
    const ok = await u.installUpdate();
    expect(ok).toBe(true);
    expect(bridge.install.mutate).toHaveBeenCalledTimes(1);
  });

  it("installUpdate never throws on bridge error", async () => {
    bridge.install.mutate.mockRejectedValue(new Error("denied"));
    const u = useUpdaterStore();
    const ok = await u.installUpdate();
    expect(ok).toBe(false);
    expect(u.lastError).toBe("denied");
  });

  it("refreshStatus applies the snapshot without a check call", async () => {
    bridge.status.query.mockResolvedValue({ available: false, version: "1.0.0", downloaded: false, progress: 0 });
    const u = useUpdaterStore();
    const ok = await u.refreshStatus();
    expect(ok).toBe(true);
    expect(bridge.check.query).not.toHaveBeenCalled();
    expect(u.phase).toBe("up-to-date");
    expect(u.statusText).toBe("Up to date");
  });

  it("phase computeds track the status snapshot reactively", async () => {
    bridge.check.query
      .mockResolvedValueOnce({ available: true, version: "2.0.0", downloaded: false, progress: 0 })
      .mockResolvedValueOnce({ available: false, version: "1.0.0", downloaded: false, progress: 0 });
    const u = useUpdaterStore();
    await u.checkForUpdates();
    expect(u.phase).toBe("available");
    await u.checkForUpdates();
    expect(u.phase).toBe("up-to-date");
  });
});

// ---------------------------------------------------------------------------
// Palette commands
// ---------------------------------------------------------------------------

function stubCtx(showShell: boolean, updater: ReturnType<typeof useUpdaterStore>): CommandContext {
  return {
    editor: undefined,
    notes: undefined as unknown as CommandContext["notes"],
    auth: { showShell } as unknown as CommandContext["auth"],
    shell: undefined as unknown as CommandContext["shell"],
    sync: undefined as unknown as CommandContext["sync"],
    updater,
    spellChecker: undefined as unknown as CommandContext["spellChecker"],
    router: undefined as CommandContext["router"],
    closePalette: () => {}
  };
}

describe("app updater commands (Phase 6.2)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetBridge();
  });

  it("registers app:check-updates / app:download-update / app:install-update", () => {
    expect(getCommand("app:check-updates")).toBeDefined();
    expect(getCommand("app:download-update")).toBeDefined();
    expect(getCommand("app:install-update")).toBeDefined();
  });

  it("app:check-updates is visible when the shell is showing", () => {
    const u = useUpdaterStore();
    const cmd = getCommand("app:check-updates")!;
    expect(cmd.when?.(stubCtx(true, u))).toBe(true);
    expect(cmd.when?.(stubCtx(false, u))).toBe(false);
  });

  it("app:download-update is visible only when an update is available", () => {
    const u = useUpdaterStore();
    const cmd = getCommand("app:download-update")!;
    // No update available → hidden.
    expect(cmd.when?.(stubCtx(true, u))).toBe(false);
    // Simulate an available update.
    bridge.check.query.mockResolvedValue({ available: true, version: "2.0.0", downloaded: false, progress: 0 });
    return u.checkForUpdates().then(() => {
      expect(cmd.when?.(stubCtx(true, u))).toBe(true);
      expect(cmd.when?.(stubCtx(false, u))).toBe(false);
    });
  });

  it("app:install-update is visible only when an update is ready", () => {
    const u = useUpdaterStore();
    const cmd = getCommand("app:install-update")!;
    expect(cmd.when?.(stubCtx(true, u))).toBe(false);
    bridge.status.query.mockResolvedValue({ available: true, version: "2.0.0", downloaded: true, progress: 100 });
    return u.refreshStatus().then(() => {
      expect(cmd.when?.(stubCtx(true, u))).toBe(true);
    });
  });

  it("app:check-updates run calls store.checkForUpdates", () => {
    bridge.check.query.mockResolvedValue(IDLE);
    const u = useUpdaterStore();
    const cmd = getCommand("app:check-updates")!;
    cmd.run(stubCtx(true, u));
    return vi.waitFor(() => expect(bridge.check.query).toHaveBeenCalledTimes(1));
  });

  it("app:download-update run calls store.downloadUpdate", () => {
    bridge.download.mutate.mockResolvedValue(true);
    bridge.status.query.mockResolvedValue(IDLE);
    const u = useUpdaterStore();
    const cmd = getCommand("app:download-update")!;
    cmd.run(stubCtx(true, u));
    return vi.waitFor(() => expect(bridge.download.mutate).toHaveBeenCalledTimes(1));
  });

  it("app:install-update run calls store.installUpdate", () => {
    bridge.install.mutate.mockResolvedValue(true);
    const u = useUpdaterStore();
    const cmd = getCommand("app:install-update")!;
    cmd.run(stubCtx(true, u));
    return vi.waitFor(() => expect(bridge.install.mutate).toHaveBeenCalledTimes(1));
  });
});