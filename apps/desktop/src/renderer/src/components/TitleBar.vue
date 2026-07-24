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
import { useOmnibarStore } from "@/stores/omnibar";
import { useUpstreamNotifierStore } from "@/stores/upstream-notifier";
import { useUpdaterStore } from "@/stores/updater";
import { desktop } from "@/platform/desktop-bridge";
import { isIndexing } from "@/utils/vector-search";
import GlobalSearchInput from "./GlobalSearchInput.vue";

const shell = useShellStore();
const titlebar = useTitleBarStore();
const omnibar = useOmnibarStore();
const upstream = useUpstreamNotifierStore();
const updater = useUpdaterStore();

// Build-time app version (Vite `define` from package.json) for the version
// label. Exposed as a script const so the template can bind it.
const appVersion = __APP_VERSION__;

// Upstream-release indicator: shown when a newer `streetwriters/notesnook`
// desktop release exists than the one we built against. Click opens the
// release page; the dismiss button hides it until a newer tag appears.
function openUpstreamRelease(): void {
  const url = upstream.status?.latestUrl;
  if (url) window.open(url, "_blank");
}

// Auto-update indicator: shown when the auto-updater found a newer release of
// THIS app on the GitHub `latest` channel, or a downloaded update is ready to
// install. Click opens the Settings window on the Updates section.
function openUpdates(): void {
  updater.openChangelog();
}

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

// Omnibar hotkeys (the title-bar picker). Three entry points, all checked on
// `e.code` (the physical key) — on macOS Option/Alt is a dead-modifier that turns
// `e.key` into a glyph, so an `e.key === "f"` check would never fire for Alt+F.
//   Ctrl/Cmd+Alt+F → notes mode   (the legacy "find in all notes" binding)
//   Ctrl/Cmd+K     → command mode (prefills `>`) — the primary telescope opener
//   Ctrl/Cmd+Shift+P → command mode (alias, preserved for muscle memory)
// Plain Cmd/Ctrl+F (no Alt) is the per-pane find-in-note binding in `Editor.vue`.
function onOmnibarHotkey(e: KeyboardEvent): void {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.altKey && e.code === "KeyF") {
    e.preventDefault();
    omnibar.openNotes();
  } else if (e.code === "KeyK") {
    e.preventDefault();
    omnibar.openCommands();
  } else if (e.shiftKey && (e.key === "p" || e.key === "P")) {
    e.preventDefault();
    omnibar.openCommands();
  }
}

onMounted(() => {
  measureControlsWidth();
  navigator.windowControlsOverlay?.addEventListener("geometrychange", onGeometryChange);
  window.addEventListener("keydown", onOmnibarHotkey);
});

onUnmounted(() => {
  navigator.windowControlsOverlay?.removeEventListener("geometrychange", onGeometryChange);
  window.removeEventListener("keydown", onOmnibarHotkey);
});
</script>

<template>
  <div
    class="titlebar-drag flex h-10 shrink-0 items-center gap-2 border-b border-glass-border bg-glass-surface backdrop-blur-2xl"
    :style="{ paddingLeft: titlebar.padding.left + 'px', paddingRight: titlebar.padding.right + 'px' }"
  >
    <button
      class="titlebar-no-drag grid h-7 w-7 place-items-center rounded-md text-sm text-text-muted transition-[opacity,background-color,color] duration-200 hover:bg-glass-hover disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
      title="Toggle Sidebar"
      :disabled="shell.focusMode"
      @click="shell.toggleSidebar()"
    >
      <Icon name="panel-left" :size="16" />
    </button>
    <!-- Focus mode: hides the sidebar + notes list for a distraction-free
         writing surface. While on, the sidebar toggle is disabled (the panel
         is force-hidden — revealing it would just hide again on re-render).
         The icon scales up slightly when active for a tactile toggle feel. -->
    <button
      class="titlebar-no-drag grid h-7 w-7 place-items-center rounded-md text-sm text-text-muted transition-[background-color,color,transform] duration-200 hover:bg-glass-hover"
      :class="shell.focusMode ? 'bg-glass-hover text-text' : ''"
      :title="shell.focusMode ? 'Exit focus mode' : 'Enter focus mode'"
      @click="shell.toggleFocusMode()"
    >
      <Icon
        name="focus"
        :size="16"
        class="transition-transform duration-200"
        :class="shell.focusMode ? 'scale-110' : ''"
      />
    </button>
    <!-- The editor tab strips live per-pane (Phase 4.2/4.3); the title-bar
         center slot hosts the global search (replacing the old app label).
         Platform-aware padding still keeps this clear of the OS window controls. -->
    <GlobalSearchInput class="flex-1" />
    <div class="flex items-center gap-1">
      <span
        v-if="upstream.hasNewer"
        class="flex items-center gap-1 rounded bg-accent/15 px-1.5 py-px text-[10px] text-accent"
        :title="`Upstream ${upstream.status?.latestTag} is newer than the ${upstream.status?.baselineTag} you built against — click to view`"
      >
        <button type="button" class="flex cursor-pointer items-center gap-1 hover:underline" @click="openUpstreamRelease">
          <Icon name="arrow-up" :size="10" /> upstream {{ upstream.status?.latestTag }}
        </button>
        <button
          type="button"
          class="cursor-pointer text-text-muted hover:text-text"
          title="Dismiss until a newer release"
          @click="upstream.dismiss()"
        >
          <Icon name="x" :size="12" />
        </button>
      </span>
      <span
        v-if="updater.updateAvailable || updater.readyToInstall"
        class="flex items-center gap-1 rounded bg-accent/15 px-1.5 py-px text-[10px] text-accent"
        :title="updater.readyToInstall ? 'A downloaded update is ready to install — click to review' : 'A new version is available — click to download'"
      >
        <button type="button" class="flex cursor-pointer items-center gap-1 hover:underline" @click="openUpdates">
          <Icon name="arrow-down" :size="10" />
          {{ updater.readyToInstall ? "ready to install" : "update available" }}
        </button>
      </span>
      <span
        v-if="isIndexing"
        class="flex items-center gap-1 rounded bg-accent/15 px-1.5 py-px text-[10px] text-accent animate-pulse"
        title="Generating vector search embeddings in background idle frames (non-blocking)"
      >
        <Icon name="loader" :size="10" class="animate-spin" />
        indexing...
      </span>
      <span class="text-[10px] text-text-muted">v{{ appVersion }}</span>
    </div>
  </div>
</template>