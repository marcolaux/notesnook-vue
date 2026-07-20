/**
 * Main-process window server (Phase 7.0 on-site) — implements the
 * {@link WindowServer} contract and registers it with the tRPC bridge.
 *
 *  - `setNativeTheme`: maps the renderer's `themeMode` (light/dark/system) to
 *    Electron's `nativeTheme.themeSource` so the OS-native window material
 *    (macOS `vibrancy: "under-window"`, Windows `backgroundMaterial: "acrylic"`)
 *    follows the app theme. Without this the acrylic tracks the *system*
 *    appearance and a dark UI on a light-mode system renders as washed-out
 *    white text on a bright acrylic.
 *  - `openSettings`: opens the shared singleton Settings window
 *    (`src/main/settings-window.ts`). Needs the preload path (resolved from the
 *    main module's `__dirname`) so the settings window gets the same preload +
 *    tRPC bridge as the main window.
 *
 * Electron-only (no Node fs); not contract-tested — the renderer calls it
 * through the typed `desktop.window.*` bridge.
 */
import { nativeTheme } from "electron";
import { registerWindowServer, type WindowServer } from "../contracts/router";
import { openSettingsWindow } from "./settings-window";

/** Create the WindowServer impl. `preloadPath` is the absolute preload path. */
export function createWindowServer(preloadPath: string): WindowServer {
  return {
    setNativeTheme(mode: "light" | "dark" | "system"): void {
      nativeTheme.themeSource = mode;
    },
    openSettings(): void {
      openSettingsWindow(preloadPath);
    }
  };
}

/**
 * Register the window server with the tRPC bridge. Call once on main boot with
 * the absolute preload path (same one passed to the main `BrowserWindow`).
 */
export function registerWindow(preloadPath: string): void {
  registerWindowServer(createWindowServer(preloadPath));
}