import { BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";
import { openSettingsWindow, isSettingsWindow } from "./settings-window";

/**
 * Application menu (Phase 4.2 on-site).
 *
 * Replaces Electron's default menu so `Cmd/Ctrl+W` closes the active editor
 * tab (signalled to the renderer via the `app:close-tab` channel exposed by
 * the preload as `window.appEvents.onCloseTab`) instead of the default "Close
 * Window" — matching the tabbed-editor convention (VS Code, browsers) the user
 * expects. The last tab closing leaves the window open; the window is closed
 * via the titlebar controls / `Cmd+Q`.
 *
 * `New Note` (`Cmd/Ctrl+N`) reuses the existing `app:tray-action` channel with
 * the `new-note` action that `App.vue` already handles (gated on `showShell`).
 *
 * `Settings…` (`Cmd/Ctrl+,` — the standard Preferences shortcut) opens the
 * shared singleton Settings window directly from main, mirroring the
 * `WindowServer.openSettings` bridge procedure the renderer's
 * `app:open-settings` command uses.
 *
 * The `editMenu`/`viewMenu`/`windowMenu`/`appMenu` roles are kept so the
 * standard clipboard/navigation/devtools/menu-bar behaviours (critical on
 * macOS, where menu accelerators drive copy/paste/undo) stay intact.
 */

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

function sendToRenderer(channel: "app:close-tab" | "app:tray-action", payload: unknown): void {
  const win = focusedWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

export function registerAppMenu(preloadPath: string): void {
  const template: MenuItemConstructorOptions[] = [
    { role: "appMenu" },
    {
      label: "File",
      submenu: [
        {
          label: "New Note",
          accelerator: "CmdOrCtrl+N",
          click: () => sendToRenderer("app:tray-action", "new-note")
        },
        { type: "separator" },
        {
          label: "Settings…",
          accelerator: "CmdOrCtrl+,",
          click: () => openSettingsWindow(preloadPath)
        },
        { type: "separator" },
        {
          label: "Close Tab",
          accelerator: "CmdOrCtrl+W",
          click: () => {
            // The Settings window has no editor tabs — `Cmd/Ctrl+W` closes the
            // window there (matching the OS "close window" expectation) instead
            // of forwarding a no-op `app:close-tab` to its renderer.
            const win = focusedWindow();
            if (isSettingsWindow(win)) {
              win?.close();
              return;
            }
            sendToRenderer("app:close-tab", "");
          }
        },
        {
          label: "Close Window",
          accelerator: "CmdOrCtrl+Shift+W",
          click: () => focusedWindow()?.close()
        }
      ]
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}