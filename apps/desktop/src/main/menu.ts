import { BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";
import { openSettingsWindow, isSettingsWindow } from "./settings-window";
import { resolveContextForWindow } from "./session-state";
import { tMain, registerLocaleChangeCallback } from "./i18n";

/**
 * Application menu (Phase 4.2 on-site / Phase 7.2 i18n).
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
 *
 * Phase 7.2: labels come from the shared catalog via `tMain` so they localize
 * with the interface locale. The menu is rebuilt on a live locale change
 * (`rebuildAppMenu`, registered as a locale-change callback) so switching
 * language updates it without a restart.
 */

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

function sendToRenderer(channel: "app:close-tab" | "app:tray-action", payload: unknown): void {
  const win = focusedWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

let preloadPathCache: string | undefined;

function buildAppMenu(preloadPath: string): Menu {
  const template: MenuItemConstructorOptions[] = [
    { role: "appMenu" },
    {
      label: tMain("menu.file"),
      submenu: [
        {
          label: tMain("menu.newNote"),
          accelerator: "CmdOrCtrl+N",
          click: () => sendToRenderer("app:tray-action", "new-note")
        },
        { type: "separator" },
        {
          label: tMain("menu.settings"),
          accelerator: "CmdOrCtrl+,",
          click: () =>
            openSettingsWindow(preloadPath, undefined, resolveContextForWindow(focusedWindow()))
        },
        { type: "separator" },
        {
          label: tMain("menu.closeTab"),
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
          label: tMain("menu.closeWindow"),
          accelerator: "CmdOrCtrl+Shift+W",
          click: () => focusedWindow()?.close()
        }
      ]
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" }
  ];

  return Menu.buildFromTemplate(template);
}

/** Register the application menu. Call once on main boot. The preload path
 *  is cached so the menu can be rebuilt on a locale change without re-passing
 *  it. */
export function registerAppMenu(preloadPath: string): void {
  preloadPathCache = preloadPath;
  Menu.setApplicationMenu(buildAppMenu(preloadPath));
}

/** Rebuild the application menu in the active locale (best-effort). Registered
 *  as a `main/i18n.ts` locale-change callback so a live language switch updates
 *  the menu without a restart. */
export function rebuildAppMenu(): void {
  if (!preloadPathCache) return;
  Menu.setApplicationMenu(buildAppMenu(preloadPathCache));
}

// Rebuild the menu when the interface locale changes at runtime.
registerLocaleChangeCallback(rebuildAppMenu);