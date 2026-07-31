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
import { app, BrowserWindow } from "electron";
import { registerUpdaterServer, type UpdateStatus, type UpdaterServer } from "../contracts/router";
import { isNewerUpstreamRelease } from "../contracts/upstream-semver";

const IDLE: UpdateStatus = { available: false, version: null, downloaded: false, progress: 0, error: null };

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
  const mod = await import("electron-updater");
  const autoUpdater = mod.autoUpdater ?? mod.default?.autoUpdater;
  if (!autoUpdater) {
    throw new Error("Failed to load autoUpdater from electron-updater");
  }
  // `autoUpdater` is a singleton; configure once.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  bindEvents(autoUpdater);
  autoUpdaterHandle = autoUpdater;
  return autoUpdater;
}

/** Attach the state-mirroring listeners exactly once. Each handler also pushes
 *  the new snapshot to every live window so the renderer's live-progress IPC
 *  subscription updates without a concurrent `check`/`download` request. */
function bindEvents(au: import("electron-updater").AppUpdater): void {
  if (eventsBound) return;
  eventsBound = true;
  au.on("update-downloaded", () => {
    status = { ...status, downloaded: true, progress: 100, available: true };
    emitState();
  });
  au.on("download-progress", (p: { percent: number }) => {
    status = { ...status, progress: Math.round(p.percent) };
    emitState();
  });
  au.on("error", (err: unknown) => {
    // Log + surface the real message. Previously this was swallowed (only
    // progress reset), so macOS failures (signature mismatch, network, etc.)
    // were indistinguishable from "no update". The message is mirrored into
    // `status.error` so the renderer's `lastError` banner can show it.
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[updater] autoUpdater error:", msg);
    status = { ...status, progress: 0, error: msg };
    emitState();
  });
}

/** Forward the current snapshot to every live window. The Settings window is a
 *  separate renderer (and the Updates section lives there), so broadcasting to
 *  all windows — not just the main one — ensures the live progress + "ready to
 *  install" state reaches the Updates UI too. No-op when no window is alive. */
function emitState(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send("updater:status", status);
  }
}

export const updaterServer: UpdaterServer = {
  async check(): Promise<UpdateStatus> {
    const au = await getAutoUpdater();
    if (!au) {
      // Dev / unpackaged: no provider to query. Populate `version` with the
      // running app version so the snapshot classifies as "up-to-date" rather
      // than "unknown" — otherwise the UI lingers on "Checking for updates…"
      // forever (`version: null` means "no check has resolved yet").
      status = { available: false, version: app.getVersion(), downloaded: status.downloaded, progress: 0 };
      emitState();
      return status;
    }
    try {
      const result = await au.checkForUpdates();
      const info = result?.updateInfo ?? null;
      const remoteVersion = info?.version ?? null;
      const currentVersion = app.getVersion();
      // `checkForUpdates` returns `UpdateCheckResult` containing the latest release info.
      // We must verify that the remote version is strictly newer than the running app version;
      // if remote <= current, the app is up to date (`available = false`).
      const available =
        !!result &&
        remoteVersion !== null &&
        isNewerUpstreamRelease(remoteVersion, currentVersion);
      const rawNotes = info?.releaseNotes;
      const releaseNotes = typeof rawNotes === "string"
        ? rawNotes
        : Array.isArray(rawNotes)
          ? rawNotes
              .map((n) => {
                if (typeof n === "string") return n;
                const v = n.version ? `v${n.version}` : "";
                const note = n.note ?? "";
                return v ? `### Version ${v}\n${note}` : note;
              })
              .join("\n\n---\n\n")
          : null;
      status = {
        available,
        version: available ? remoteVersion : currentVersion,
        downloaded: status.downloaded,
        progress: 0,
        error: null,
        releaseNotes
      };
      emitState();
      return status;
    } catch (err) {
      // Network/provider error → keep the last known status (don't wipe to
      // IDLE, which would regress a known "up-to-date" back to "Checking…").
      // Log + surface the message so macOS failures aren't a silent no-op;
      // only progress is reset, the prior snapshot otherwise stays intact.
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[updater] check error:", msg);
      status = { ...status, progress: 0, error: msg };
      emitState();
      return status;
    }
  },

  async download(): Promise<boolean> {
    const au = await getAutoUpdater();
    if (!au) {
      // Dev mode: simulate download progress so the UI flow can be verified in dev
      status = { ...status, progress: 10, downloaded: false, available: true };
      emitState();

      let p = 10;
      const interval = setInterval(() => {
        p += 30;
        if (p >= 100) {
          clearInterval(interval);
          status = { ...status, progress: 100, downloaded: true, available: true };
          emitState();
        } else {
          status = { ...status, progress: p, downloaded: false, available: true };
          emitState();
        }
      }, 250);
      return true;
    }

    try {
      status = { ...status, progress: 0, downloaded: false };
      emitState();
      await au.downloadUpdate();
      return true;
    } catch (err) {
      status = { ...status, progress: 0 };
      emitState();
      throw err;
    }
  },

  async install(): Promise<boolean> {
    const au = await getAutoUpdater();
    if (!au) {
      // Dev mode: reset snapshot to up-to-date
      status = { available: false, version: app.getVersion(), downloaded: false, progress: 0 };
      emitState();
      return true;
    }
    try {
      au.autoInstallOnAppQuit = true;
      setImmediate(() => {
        try {
          au.quitAndInstall(false, true);
        } catch (err) {
          console.error("[updater] au.quitAndInstall error:", err);
          app.quit();
        }
      });
      return true;
    } catch (err) {
      throw err;
    }
  },

  async status(): Promise<UpdateStatus> {
    return status;
  }
};

export function registerUpdater(_window?: BrowserWindow): void {
  // `emitState` broadcasts to all live windows, so we no longer pin a single
  // target window — the `_window` arg is retained only for call-site parity.
  registerUpdaterServer(updaterServer);
}