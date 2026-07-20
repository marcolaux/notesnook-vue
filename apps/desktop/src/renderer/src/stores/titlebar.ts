/**
 * Titlebar store (Phase 3.1) — the renderer-side companion to the per-platform
 * `BrowserWindow` chrome built in `main/titlebar.ts`. Owns the platform
 * detection (from `window.os`, exposed by the preload as `process.platform`)
 * and the horizontal padding the `TitleBar` component must apply so its content
 * clears the OS-drawn window controls:
 *
 * - macOS: left inset for the native traffic lights.
 * - Windows/Linux: right inset for the Window Controls Overlay caption buttons.
 *
 * The WCO geometry is read from `navigator.windowControlsOverlay` by the
 * `TitleBar` component at mount/resize (on-site, DOM) and pushed here via
 * `setControlsWidth`; until then the fallback width is used. The store is
 * deliberately free of IPC/DOM coupling beyond `window.os` so it is unit-testable
 * in a node environment (platform + controls width are injectable).
 */
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  detectPlatform,
  titlebarPadding,
  WINDOW_CONTROLS_FALLBACK_WIDTH,
  type Platform
} from "@contracts/titlebar";

function readPlatform(): Platform {
  // `window.os` is exposed by the preload (`process.platform`). Guarded so the
  // store can be constructed in a node test environment without a window.
  const os = typeof window !== "undefined" ? window.os : undefined;
  return detectPlatform(os);
}

export const useTitleBarStore = defineStore("titlebar", () => {
  const platform = ref<Platform>(readPlatform());
  /** Right-side WCO width (px). 0 → use the fallback in `titlebarPadding`. */
  const controlsWidth = ref<number>(0);

  const isMacos = computed(() => platform.value === "macos");
  const isWindows = computed(() => platform.value === "windows");
  const isLinux = computed(() => platform.value === "linux");
  /** Running inside the Electron desktop shell (not a web fallback). */
  const isDesktop = computed(
    () => platform.value !== "other" && platform.value !== undefined
  );

  const padding = computed(() => titlebarPadding(platform.value, controlsWidth.value));

  /** Effective right inset (fallback until the real WCO geometry is pushed). */
  const effectiveControlsWidth = computed(
    () => (controlsWidth.value > 0 ? controlsWidth.value : WINDOW_CONTROLS_FALLBACK_WIDTH)
  );

  /** Test/mount hook: override the detected platform. */
  function setPlatform(p: Platform): void {
    platform.value = p;
  }

  /** Push the measured Window Controls Overlay width (px). 0 resets to fallback. */
  function setControlsWidth(width: number): void {
    controlsWidth.value = width >= 0 ? width : 0;
  }

  return {
    platform,
    controlsWidth,
    isMacos,
    isWindows,
    isLinux,
    isDesktop,
    padding,
    effectiveControlsWidth,
    setPlatform,
    setControlsWidth
  };
});