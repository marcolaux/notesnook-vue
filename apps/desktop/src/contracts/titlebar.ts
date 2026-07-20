/**
 * Platform-aware titlebar helpers (Phase 3.1). Pure, dependency-free, shared
 * by the Electron main process (`buildBrowserWindowOptions`), the renderer
 * (`useTitleBarStore` + `TitleBar.vue`) and the contract tests.
 *
 * The renderer's only job for the custom titlebar is to *reserve space* for the
 * OS-drawn window controls so its own content (sidebar toggle, app label) does
 * not sit underneath them:
 *
 * - **macOS** (`titleBarStyle: "hiddenInset"`): the native traffic-light buttons
 *   (close/min/max) are inset into the left edge. Reserve a left inset so the
 *   sidebar toggle clears them.
 * - **Windows / Linux** (Window Controls Overlay, `titleBarOverlay`): the native
 *   min/max/close buttons are drawn by the OS at the right edge. Reserve a right
 *   inset (the real width comes from `navigator.windowControlsOverlay` at
 *   runtime; a fallback is used until then).
 *
 * The controls themselves are native — the renderer does NOT draw or IPC its
 * own min/max/close buttons. That keeps behaviour consistent with the host OS
 * and is exactly what the roadmap's "Window Controls Overlay (Win/Linux)" calls
 * for.
 */
export type Platform = "macos" | "windows" | "linux" | "other";

/**
 * Map a `process.platform` string (exposed to the renderer as `window.os` by
 * the preload) to a `Platform`. Unknown values fall back to `"other"` (framed
 * window, no insets) so a stray web build degrades gracefully.
 */
export function detectPlatform(os: string | undefined | null): Platform {
  switch (os) {
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    case "linux":
      return "linux";
    default:
      return "other";
  }
}

/**
 * Left inset on macOS so the sidebar toggle clears the native traffic-light
 * buttons. `hiddenInset` parks the lights ~7px from the left; the three
 * buttons plus their padding occupy roughly this width.
 */
export const TRAFFIC_LIGHT_INSET = 78;

/**
 * Fallback right inset on Windows/Linux until the real Window Controls Overlay
 * geometry is read from `navigator.windowControlsOverlay.getTitlebarArea()`.
 * Three caption buttons (min/max/close) at ~46px each.
 */
export const WINDOW_CONTROLS_FALLBACK_WIDTH = 138;

/** Base horizontal padding (px) applied to the titlebar on every platform. */
const BASE_PADDING = 12;

export interface TitlebarPadding {
  /** Left padding (px) — traffic-light inset on macOS, base elsewhere. */
  left: number;
  /** Right padding (px) — WCO width on Win/Linux, base elsewhere. */
  right: number;
}

/**
 * Compute the titlebar's horizontal padding for a platform. On Windows/Linux
 * `controlsWidth` overrides the fallback once the real WCO geometry is known
 * (0 → fallback; pass the measured width to use it).
 */
export function titlebarPadding(
  platform: Platform,
  controlsWidth = 0
): TitlebarPadding {
  switch (platform) {
    case "macos":
      return { left: TRAFFIC_LIGHT_INSET, right: BASE_PADDING };
    case "windows":
    case "linux":
      return {
        left: BASE_PADDING,
        right: controlsWidth > 0 ? controlsWidth : WINDOW_CONTROLS_FALLBACK_WIDTH
      };
    default:
      return { left: BASE_PADDING, right: BASE_PADDING };
  }
}