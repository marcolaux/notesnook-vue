/**
 * Shell store (Phase 3.5) — owns the two pane-collapse flags shared across the
 * router boundary (TitleBar / Sidebar / NotesList). Replaces the local refs
 * that lived in `App.vue` so collapsing works without prop-drilling through
 * `<RouterView>`.
 *
 * Also owns the persisted sidebar + notes-list widths (the resizable left
 * panels). These are client-only, localStorage-backed under the
 * `notesnook.config.*` prefix (same family as `stores/config.ts`), so they
 * survive a restart but are NOT synced through `db.settings`. Best-effort
 * read/write: a unavailable/throwing `localStorage` falls back to defaults.
 */
import { defineStore } from "pinia";
import { ref } from "vue";
import {
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  LIST_DEFAULT,
  LIST_MAX,
  LIST_MIN,
  clampWidth
} from "@/utils/resizer";

/** localStorage key suffix for each persisted width. */
const SIDEBAR_WIDTH_KEY = "notesnook.config.sidebarWidth";
const LIST_WIDTH_KEY = "notesnook.config.listWidth";

/** Read + parse a persisted width, falling back to `fallback` on miss/parse
 *  error/unavailable localStorage. */
function readWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "number" ? clampWidth(parsed, min, max) : fallback;
  } catch {
    return fallback;
  }
}

/** Write a width as JSON. Best-effort — a write failure is swallowed. */
function writeWidth(key: string, value: number): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* best-effort — persistence is optional */
  }
}

export const useShellStore = defineStore("shell", () => {
  const sidebarCollapsed = ref(false);
  const listCollapsed = ref(false);
  /** Right-side properties panel visibility (Phase 5.1). Off by default;
   * toggled via palette/toolbar commands. (The ToC/Minimap panel is per-tab —
   * `editor-layout.toggleToc(tabId)` — not a global shell flag.) */
  const propertiesVisible = ref(false);
  /** Focus mode (multi-window): hides BOTH the sidebar and the notes list,
   * leaving just the titlebar + editor + status bar — a distraction-free
   * writing surface. Overrides the individual collapse flags (toggling it off
   * restores whatever they were). The torn-off note window boots with this on;
   * the main window can toggle it via the command palette. */
  const focusMode = ref(false);

  // --- Resizable left-panel widths (persisted, client-only) -------------------
  const sidebarWidth = ref(readWidth(SIDEBAR_WIDTH_KEY, SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX));
  const listWidth = ref(readWidth(LIST_WIDTH_KEY, LIST_DEFAULT, LIST_MIN, LIST_MAX));

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  function toggleList(): void {
    listCollapsed.value = !listCollapsed.value;
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

  /** Set + persist the sidebar width (clamped to `[SIDEBAR_MIN, SIDEBAR_MAX]`). */
  function setSidebarWidth(px: number): void {
    const next = clampWidth(px, SIDEBAR_MIN, SIDEBAR_MAX);
    sidebarWidth.value = next;
    writeWidth(SIDEBAR_WIDTH_KEY, next);
  }

  /** Set + persist the notes-list width (clamped to `[LIST_MIN, LIST_MAX]`). */
  function setListWidth(px: number): void {
    const next = clampWidth(px, LIST_MIN, LIST_MAX);
    listWidth.value = next;
    writeWidth(LIST_WIDTH_KEY, next);
  }

  return {
    sidebarCollapsed,
    listCollapsed,
    propertiesVisible,
    focusMode,
    sidebarWidth,
    listWidth,
    toggleSidebar,
    toggleList,
    toggleProperties,
    toggleFocusMode,
    setFocusMode,
    setSidebarWidth,
    setListWidth
  };
});