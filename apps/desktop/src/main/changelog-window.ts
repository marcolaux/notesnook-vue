/**
 * Changelog window — opens the latest release notes in its own dedicated Electron
 * `BrowserWindow` (singleton) rather than an in-app overlay across all windows.
 */
import { BrowserWindow } from "electron";
import { resolve } from "node:path";
import { buildBrowserWindowOptionsForOS } from "./titlebar";
import { attachTRPC } from "./ipc";
import { setupExternalNavigation } from "./navigation";

let changelogWindow: BrowserWindow | null = null;

export function isChangelogWindow(win: BrowserWindow | undefined | null): boolean {
  return !!win && !win.isDestroyed() && win === changelogWindow;
}

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
    title: "What's New"
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
