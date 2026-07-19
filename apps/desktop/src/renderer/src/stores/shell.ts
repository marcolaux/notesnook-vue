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

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  function toggleList(): void {
    listCollapsed.value = !listCollapsed.value;
  }

  return { sidebarCollapsed, listCollapsed, toggleSidebar, toggleList };
});