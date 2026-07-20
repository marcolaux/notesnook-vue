/**
 * Main-process window server (Phase 7.0 on-site) — implements the
 * {@link WindowServer} contract and registers it with the tRPC bridge.
 *
 * Currently only `setNativeTheme`: maps the renderer's `themeMode`
 * (light/dark/system) to Electron's `nativeTheme.themeSource` so the
 * OS-native window material (macOS `vibrancy: "under-window"`, Windows
 * `backgroundMaterial: "acrylic"`) follows the app theme. Without this the
 * acrylic tracks the *system* appearance and a dark UI on a light-mode
 * system renders as washed-out white text on a bright acrylic.
 *
 * Electron-only (no Node fs); not contract-tested — the renderer calls it
 * through the typed `desktop.window.setNativeTheme` bridge.
 */
import { nativeTheme } from "electron";
import { registerWindowServer, type WindowServer } from "../contracts/router";

const impl: WindowServer = {
  setNativeTheme(mode: "light" | "dark" | "system"): void {
    nativeTheme.themeSource = mode;
  }
};

/** Register the window server with the tRPC bridge. Call once on main boot. */
export function registerWindow(): void {
  registerWindowServer(impl);
}