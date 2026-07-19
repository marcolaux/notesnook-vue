import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { useNotesStore } from "@/stores/notes";
import { extractTableOfContents, type TocItem } from "@/utils/toc";

/**
 * Table-of-contents store (Phase 5.2) — derives the active note's heading
 * outline from its loaded HTML via {@link extractTableOfContents}, and exposes
 * a `scrollToSignal` the editor watches (on-site) to jump the cursor to a
 * heading on miniMap click. The miniMap UI + the editor-side live re-derivation
 * on every edit are on-site; the computed outline is the headless foundation.
 *
 * `items` recomputes from `notes.activeContent` (the loaded HTML). For a
 * truly-live ToC the editor can later push its own outline — `setItems` is
 * exposed for that — but the headless path derives from content.
 */
export const useTocStore = defineStore("toc", () => {
  const notes = useNotesStore();

  /** The active note's heading outline (derived from the loaded HTML, or
   * pushed live by the editor via {@link setItems}). */
  const items = ref<TocItem[]>([]);
  /** Bumped by `goto(id)` with the target heading id; the editor watches it
   * to scroll the cursor into view (on-site). The target id is also kept in
   * `scrollTarget` for the watcher to read. */
  const scrollToSignal = ref(0);
  const scrollTarget = ref<string | null>(null);

  /** Active note id (or null), for consumers that want to key on it. */
  const activeNoteId = computed(() => notes.activeNote?.id ?? null);

  /** Recompute the outline from the loaded content. */
  function refresh(): void {
    items.value = extractTableOfContents(notes.activeContent || "");
  }

  /** Live-editor push: the editor can push its current outline directly so
   * the ToC updates as the user types without re-parsing HTML. */
  function setItems(next: TocItem[]): void {
    items.value = next;
  }

  /** Request a scroll to `id` (the editor watches `scrollToSignal`). */
  function goto(id: string): void {
    scrollTarget.value = id;
    scrollToSignal.value += 1;
  }

  // Recompute the outline whenever the active note or its loaded content
  // changes. `flush: "sync"` so the headless tests assert synchronously, and
  // `immediate` so an already-open note seeds the outline on first mount.
  watch(activeNoteId, () => refresh(), { immediate: true, flush: "sync" });
  watch(() => notes.activeContent, () => refresh(), { flush: "sync" });

  return {
    items,
    scrollToSignal,
    scrollTarget,
    activeNoteId,
    refresh,
    setItems,
    goto
  };
});