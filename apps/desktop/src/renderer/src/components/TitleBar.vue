<script setup lang="ts">
/**
 * Custom titlebar (Phase 3.1). A drag region (`titlebar-drag`) with the sidebar
 * toggle + app label; interactive children opt out via `titlebar-no-drag`.
 *
 * Horizontal padding is platform-aware so the renderer's own content never sits
 * under the OS-drawn window controls:
 * - macOS: left padding clears the native traffic-light buttons.
 * - Windows/Linux: right padding clears the Window Controls Overlay caption
 *   buttons. The real width is measured from `navigator.windowControlsOverlay`
 *   at mount + on geometry change and pushed to the store; until then the
 *   fallback width is used.
 */
import { onMounted, onUnmounted } from "vue";
import { Icon } from "@notesnook-vue/ui-vue";
import { useShellStore } from "@/stores/shell";
import { useTitleBarStore } from "@/stores/titlebar";
import { useSearchStore } from "@/stores/search";
import GlobalSearchInput from "./GlobalSearchInput.vue";

const shell = useShellStore();
const titlebar = useTitleBarStore();
const search = useSearchStore();

// Measure the real Window Controls Overlay width (Windows/Linux) so the right
// padding exactly clears the OS caption buttons. `getTitlebarArea()` returns
// the titlebar area available to web content (excludes the controls), so the
// controls width = viewport width − (area.x + area.width). On macOS / web the
// API is absent and the store keeps its fallback (0 → ignored on macOS).
function measureControlsWidth(): void {
  const wco = navigator.windowControlsOverlay;
  // The WCO object can be present without an active overlay (e.g. macOS
  // `hiddenInset` titlebar has no WCO), in which case `getTitlebarArea` is
  // undefined — calling it throws and crashes the mounted hook. Guard on the
  // method itself, not just the object.
  if (!wco || typeof wco.getTitlebarArea !== "function") return;
  const area = wco.getTitlebarArea();
  const controls = window.innerWidth - (area.x + area.width);
  titlebar.setControlsWidth(controls > 0 ? controls : 0);
}

function onGeometryChange(): void {
  measureControlsWidth();
}

// Global-search hotkey: Ctrl/Cmd+Alt+F focuses the title-bar search input (the
// store bumps `focusSignal`, which the input watches). Plain Cmd/Ctrl+F is the
// per-pane find-in-note binding (no Alt) — Alt+F is unclaimed and reads as "find".
// NOTE: check `e.code === "KeyF"` (the physical key), NOT `e.key` — on macOS
// Option/Alt is a dead-modifier that changes `e.key` to a glyph (Alt+F → "ƒ"),
// so an `e.key === "f"` check would never fire on macOS.
function onGlobalSearchHotkey(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === "KeyF") {
    e.preventDefault();
    search.focus();
  }
}

onMounted(() => {
  measureControlsWidth();
  navigator.windowControlsOverlay?.addEventListener("geometrychange", onGeometryChange);
  window.addEventListener("keydown", onGlobalSearchHotkey);
});

onUnmounted(() => {
  navigator.windowControlsOverlay?.removeEventListener("geometrychange", onGeometryChange);
  window.removeEventListener("keydown", onGlobalSearchHotkey);
});
</script>

<template>
  <div
    class="titlebar-drag flex h-10 shrink-0 items-center gap-2 border-b border-glass-border bg-glass-surface backdrop-blur-2xl"
    :style="{ paddingLeft: titlebar.padding.left + 'px', paddingRight: titlebar.padding.right + 'px' }"
  >
    <button
      class="titlebar-no-drag grid h-7 w-7 place-items-center rounded-md text-sm text-text-muted hover:bg-glass-hover"
      title="Toggle Sidebar"
      @click="shell.toggleSidebar()"
    >
      <Icon name="panel-left" :size="16" />
    </button>
    <!-- The editor tab strips live per-pane (Phase 4.2/4.3); the title-bar
         center slot hosts the global search (replacing the old app label).
         Platform-aware padding still keeps this clear of the OS window controls. -->
    <GlobalSearchInput class="flex-1" />
    <div class="flex items-center gap-1">
      <span class="text-[10px] text-text-muted">v0.0.1</span>
    </div>
  </div>
</template>