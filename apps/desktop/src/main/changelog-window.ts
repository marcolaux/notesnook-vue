/**
 * Changelog window — opens the latest release notes in its own dedicated Electron
 * `BrowserWindow` (singleton) rather than an in-app overlay across all windows.
 */
import { BrowserWindow } from "electron";
import { resolve } from "node:path";
import { buildBrowserWindowOptionsForOS } from "./titlebar";
import { attachTRPC } from "./ipc";
import { setupExternalNavigation } from "./navigation";
import { tMain, registerLocaleChangeCallback } from "./i18n";

let changelogWindow: BrowserWindow | null = null;

export function isChangelogWindow(win: BrowserWindow | undefined | null): boolean {
  return !!win && !win.isDestroyed() && win === changelogWindow;
}

/**
 * Re-apply the localized OS-native window title to the open Changelog window.
 *
 * Why this exists: the renderer loads the same `index.html` as every other
 * window, whose `<title>Notesnook</title>` clobbers the `BrowserWindow` `title`
 * option once the page parses — so the Phase 7.2 `title: tMain(...)`
 * constructor option only flashes pre-paint, then becomes "Notesnook". This
 * re-asserts the localized title (a) once after `did-finish-load` so the
 * steady-state taskbar/Dock/Alt-Tab title is localized at first open, and
 * (b) on a live locale switch via the registered locale-change callback. The
 * in-app custom titlebar already localizes reactively (vue-i18n `t()`); this
 * only fixes the OS-native chrome. No-op when the window is closed/destroyed.
 */
function retitleChangelogWindow(): void {
  if (changelogWindow && !changelogWindow.isDestroyed()) {
    changelogWindow.setTitle(tMain("window.whatsNew"));
  }
}

registerLocaleChangeCallback(retitleChangelogWindow);

export function openChangelogWindow(preloadPath: string): void {
  if (changelogWindow && !changelogWindow.isDestroyed()) {
    if (changelogWindow.isMinimized()) changelogWindow.restore();
    changelogWindow.show();
    changelogWindow.focus();
    return;
  }

  const base = buildBrowserWindowOptionsForOS(process.platform, preloadPath);
  changelogWindow = new BrowserWindow({
    ...base,
    width: 640,
    height: 720,
    minWidth: 460,
    minHeight: 400,
    title: tMain("window.whatsNew")
  });

  attachTRPC(changelogWindow);
  setupExternalNavigation(changelogWindow.webContents);

  changelogWindow.on("closed", () => {
    changelogWindow = null;
  });
  changelogWindow.once("ready-to-show", () => {
    changelogWindow?.show();
    changelogWindow?.moveTop();
    changelogWindow?.focus();
  });

  // The page's `<title>Notesnook</title>` overrides the `BrowserWindow` `title`
  // option once it parses; re-assert the localized title after load completes
  // (and on every reload/HMR in dev) so the steady-state OS-native title is
  // localized. Idempotent + safe on a still-alive window. See
  // `retitleChangelogWindow` for the live locale-switch path.
  changelogWindow.webContents.on("did-finish-load", () => {
    retitleChangelogWindow();
  });

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    const params = new URLSearchParams({ window: "changelog" });
    void changelogWindow.loadURL(`${devUrl}?${params.toString()}`);
  } else {
    void changelogWindow.loadFile(resolve(__dirname, "../renderer/index.html"), {
      query: { window: "changelog" }
    });
  }
}
