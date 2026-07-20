/**
 * Shell store (Phase 3.5) — owns the two pane-collapse flags shared across the
 * router boundary (TitleBar / Sidebar / NotesList). Replaces the local refs
 * that lived in `App.vue` so collapsing works without prop-drilling through
 * `<RouterView>`.
 */
import { defineStore } from "pinia";
import { ref } from "vue";

export const useShellStore = defineStore("shell", () => {
  const sidebarCollapsed = ref(false);
  const listCollapsed = ref(false);
  /** Right-side panel visibility (Phase 5.1/5.2): the ToC miniMap + the
   * properties panel. Off by default; toggled via palette/toolbar commands. */
  const tocVisible = ref(false);
  const propertiesVisible = ref(false);
  /** Focus mode (multi-window): hides BOTH the sidebar and the notes list,
   * leaving just the titlebar + editor + status bar — a distraction-free
   * writing surface. Overrides the individual collapse flags (toggling it off
   * restores whatever they were). The torn-off note window boots with this on;
   * the main window can toggle it via the command palette. */
  const focusMode = ref(false);

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  function toggleList(): void {
    listCollapsed.value = !listCollapsed.value;
  }

  function toggleToc(): void {
    tocVisible.value = !tocVisible.value;
  }

  function toggleProperties(): void {
    propertiesVisible.value = !propertiesVisible.value;
  }

  function toggleFocusMode(): void {
    focusMode.value = !focusMode.value;
  }

  function setFocusMode(value: boolean): void {
    focusMode.value = value;
  }

  return {
    sidebarCollapsed,
    listCollapsed,
    tocVisible,
    propertiesVisible,
    focusMode,
    toggleSidebar,
    toggleList,
    toggleToc,
    toggleProperties,
    toggleFocusMode,
    setFocusMode
  };
});