/**
 * Main-process auto-updater (Phase 6.2) — wraps `electron-updater`'s
 * `autoUpdater` behind the {@link UpdaterServer} contract and registers it
 * with the tRPC bridge.
 *
 * `electron-updater` only operates in a **packaged, signed** build (it reads
 * `app-update.yml` baked by `electron-builder` and talks to the publish
 * provider). In dev (`!app.isPackaged`) every method short-circuits to a
 * no-op status — so `npm run dev` and the contract suite never hit the
 * network or construct the updater. The lazy `import("electron-updater")`
 * (inside the packaged branch) keeps the dev boot path free of the
 * `autoUpdater` singleton, which would otherwise require the packaged
 * `app-update.yml` and warn on construction.
 *
 * State tracking: `autoUpdater` is event-driven, but the bridge contract is
 * request/response. We mirror the relevant events (`update-downloaded`,
 * `download-progress`, `error`) into a local snapshot so `status()` returns a
 * fresh view without a network round-trip. `check()` performs the network
 * check and returns the post-check snapshot.
 *
 * Live update verification (provider URL, signature, restart loop) is an
 * on-site / release gate — it needs a published, signed build + network.
 */
import { app, type BrowserWindow } from "electron";
import { registerUpdaterServer, type UpdateStatus, type UpdaterServer } from "../contracts/router";

const IDLE: UpdateStatus = { available: false, version: null, downloaded: false, progress: 0 };

/** Current snapshot, mutated by `autoUpdater` events + `check()`. */
let status: UpdateStatus = { ...IDLE };
/** Bound once so event listeners are not re-attached on every call. */
let eventsBound = false;
/** Cached lazy `autoUpdater` handle (resolved only when packaged). */
let autoUpdaterHandle: import("electron-updater").AppUpdater | undefined;

/** Lazily import + configure `autoUpdater`. Returns `undefined` in dev. */
async function getAutoUpdater(): Promise<import("electron-updater").AppUpdater | undefined> {
  if (!app.isPackaged) return undefined;
  if (autoUpdaterHandle) return autoUpdaterHandle;
  const { autoUpdater } = await import("electron-updater");
  // `autoUpdater` is a singleton; configure once.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  bindEvents(autoUpdater);
  autoUpdaterHandle = autoUpdater;
  return autoUpdater;
}

/** Attach the state-mirroring listeners exactly once. */
function bindEvents(au: import("electron-updater").AppUpdater): void {
  if (eventsBound) return;
  eventsBound = true;
  au.on("update-downloaded", () => {
    status = { ...status, downloaded: true, progress: 100, available: true };
  });
  au.on("download-progress", (p: { percent: number }) => {
    status = { ...status, progress: Math.round(p.percent) };
  });
  au.on("error", () => {
    // Surface as "no update" without clobbering a previously-known version.
    status = { ...status, progress: 0 };
  });
}

/** Optional window to forward state changes to (renderer can listen on-site). */
let targetWindow: BrowserWindow | undefined;
export function setUpdaterWindow(window: BrowserWindow | undefined): void {
  targetWindow = window;
}

function emitState(): void {
  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.webContents.send("updater:status", status);
  }
}

export const updaterServer: UpdaterServer = {
  async check(): Promise<UpdateStatus> {
    const au = await getAutoUpdater();
    if (!au) return { ...IDLE };
    try {
      const result = await au.checkForUpdates();
      const info = result?.updateInfo ?? null;
      const version = info?.version ?? null;
      // `checkForUpdates` resolves with an update when a newer version exists;
      // absence means up-to-date.
      const available = !!result && version !== null;
      status = { available, version, downloaded: status.downloaded, progress: 0 };
      emitState();
      return status;
    } catch {
      // Network/provider error → treat as "no update known".
      status = { ...IDLE };
      emitState();
      return status;
    }
  },

  async download(): Promise<boolean> {
    const au = await getAutoUpdater();
    if (!au) return false;
    try {
      status = { ...status, progress: 0, downloaded: false };
      emitState();
      await au.downloadUpdate();
      return true;
    } catch {
      status = { ...status, progress: 0 };
      emitState();
      return false;
    }
  },

  async install(): Promise<boolean> {
    const au = await getAutoUpdater();
    if (!au) return false;
    try {
      // `quitAndInstall` is synchronous; it closes windows + relaunches.
      au.quitAndInstall();
      return true;
    } catch {
      return false;
    }
  },

  async status(): Promise<UpdateStatus> {
    return status;
  }
};

export function registerUpdater(window?: BrowserWindow): void {
  setUpdaterWindow(window);
  registerUpdaterServer(updaterServer);
}