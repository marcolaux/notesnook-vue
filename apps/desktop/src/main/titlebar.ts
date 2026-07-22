/**
 * Main-process titlebar/window-chrome options (Phase 3.1). Builds the
 * `BrowserWindow` constructor options per platform so the custom titlebar gets
 * the right native controls + background material:
 *
 * - **macOS**: `titleBarStyle: "hiddenInset"` (native traffic lights inset into
 *   the left) + `vibrancy: "under-window"` for the glass blur.
 * - **Windows**: `titleBarStyle: "hidden"` + `titleBarOverlay` (Window Controls
 *   Overlay — OS draws min/max/close at the right edge) + `backgroundMaterial:
 *   "acrylic"` (Win11 translucent blur).
 * - **Linux**: `titleBarStyle: "hidden"` + `titleBarOverlay` (WCO, supported on
 *   recent Electron) + frameless; no vibrancy API on Linux.
 * - **other** (web/fallback): a normal framed window.
 *
 * The transparent `backgroundColor` lets the platform blur show through the
 * renderer's glass surfaces. `webPreferences` is built here too so all
 * window-creation config lives in one declarative place; only the preload path
 * (resolved from the main module's `__dirname`) is passed in.
 */
import type { BrowserWindowConstructorOptions, WebPreferences } from "electron";
import { detectPlatform, type Platform } from "../contracts/titlebar";
import type { WindowBounds } from "../contracts/session-state";

const BASE_WINDOW = {
  width: 1280,
  height: 800,
  minWidth: 800,
  minHeight: 600,
  show: false,
  autoHideMenuBar: true,
  backgroundColor: "#00000000"
} as const;

/** WCO caption-button overlay — transparent so the acrylic/vibrancy shows. */
const TITLE_BAR_OVERLAY = {
  color: "rgba(0, 0, 0, 0)",
  symbolColor: "#ffffff",
  height: 40
} as const;

function webPreferences(preloadPath: string): WebPreferences {
  // `@notesnook/core` runs in the renderer (it orchestrates the Database;
  // storage/crypto/fs are shims that call main over tRPC). Core's browser build
  // + the libsodium browser build reference node globals (`Buffer`, `process`)
  // at module-eval time, so the renderer main world needs them. contextIsolation
  // stays on so the preload/tRPC bridge remains in its own world.
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: true,
    sandbox: false
  };
}

/**
 * Build the full `BrowserWindow` constructor options for a platform. The
 * preload path is resolved by the caller (it depends on the main module's
 * `__dirname`, which differs in dev vs. packaged).
 *
 * Optional `bounds` overrides the `BASE_WINDOW` width/height/x/y so a window
 * reopens at its last size/position (session restore). The caller applies
 * `win.maximize()` after construction when `bounds.maximized` is true (a
 * maximized window's saved size is its unmaximized restore size).
 */
export function buildBrowserWindowOptions(
  platform: Platform,
  preloadPath: string,
  bounds?: WindowBounds | undefined
): BrowserWindowConstructorOptions {
  const webPrefs = webPreferences(preloadPath);
  const sized: BrowserWindowConstructorOptions = bounds
    ? {
        ...BASE_WINDOW,
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y
      }
    : { ...BASE_WINDOW };

  switch (platform) {
    case "macos":
      return {
        ...sized,
        titleBarStyle: "hiddenInset",
        frame: false,
        vibrancy: "under-window",
        visualEffectState: "active",
        webPreferences: webPrefs
      };
    case "windows":
      return {
        ...sized,
        titleBarStyle: "hidden",
        titleBarOverlay: TITLE_BAR_OVERLAY,
        backgroundMaterial: "acrylic",
        webPreferences: webPrefs
      };
    case "linux":
      return {
        ...sized,
        titleBarStyle: "hidden",
        titleBarOverlay: TITLE_BAR_OVERLAY,
        frame: false,
        webPreferences: webPrefs
      };
    default:
      return {
        ...sized,
        frame: true,
        webPreferences: webPrefs
      };
  }
}

/** Convenience: detect the platform from `process.platform` and build options. */
export function buildBrowserWindowOptionsForOS(
  os: string,
  preloadPath: string,
  bounds?: WindowBounds | undefined
): BrowserWindowConstructorOptions {
  return buildBrowserWindowOptions(detectPlatform(os), preloadPath, bounds);
}