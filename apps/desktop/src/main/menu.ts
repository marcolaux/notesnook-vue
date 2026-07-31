import { BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";
import { openSettingsWindow, isSettingsWindow } from "./settings-window";
import { openAccountWindow } from "./account-window";
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

function sendToRenderer(
  channel: "app:close-tab" | "app:tray-action" | "app:shell-toggle" | "app:reopen-closed-tab",
  payload: unknown
): void {
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
        {
          label: tMain("menu.newWindow"),
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => {
            // Open a fresh full-shell window bound to the focused window's
            // account context (its bound `contextId`), mirroring the account
            // switcher's "Open in new window" action. Fall back to the local
            // context when no window is bound yet (boot / Settings-only) so the
            // shortcut always opens something usable.
            const ctx = resolveContextForWindow(focusedWindow()) ?? "local";
            openAccountWindow(preloadPath, ctx);
          }
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
        },
        {
          label: tMain("menu.reopenClosedTab"),
          accelerator: "CmdOrCtrl+Shift+T",
          click: () => sendToRenderer("app:reopen-closed-tab", "")
        }
      ]
    },
    { role: "editMenu" },
    // Build the View menu explicitly (instead of the `viewMenu` role) so the
    // sidebar / focus-mode toggles can sit alongside the standard
    // zoom/devtools/fullscreen role items. The toggle state lives in the
    // renderer's shell store, so the `click` handlers signal it via the
    // `app:shell-toggle` channel (`onShellToggle` in the preload) — same shape
    // as `app:close-tab`. The renderer ignores the signal before the shell is
    // visible (login / Settings window).
    {
      label: tMain("menu.view"),
      submenu: [
        {
          label: tMain("menu.toggleSidebar"),
          accelerator: "CmdOrCtrl+S",
          click: () => sendToRenderer("app:shell-toggle", "sidebar")
        },
        {
          label: tMain("menu.toggleFocusMode"),
          accelerator: "CmdOrCtrl+.",
          click: () => sendToRenderer("app:shell-toggle", "focus")
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    // Override the `windowMenu` role's default submenu. On Windows/Linux the
    // default submenu injects a `close` item bound to `CmdOrCtrl+W`, which
    // collides with the custom "Close Tab" item above (File menu) and — being
    // registered later — wins the accelerator dispatch, closing the whole
    // BrowserWindow instead of a tab. Building the submenu explicitly (minus
    // the `close` role) leaves `CmdOrCtrl+W` bound only to "Close Tab" on every
    // platform. macOS gets its native "Bring All to Front" via the `front` role.
    {
      role: "windowMenu",
      submenu:
        process.platform === "darwin"
          ? [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }]
          : [{ role: "minimize" }, { role: "zoom" }]
    }
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