/**
 * Per-tab table-of-contents composable (ToC/Minimap right sidebar).
 *
 * Like {@link useNoteHistoryTimeline}, this is a **per-instance** composable
 * created by `TocSidebar.vue` with the note id of *its own* tab — so each
 * split pane's ToC sidebar describes the tab it lives in, not the global
 * active note. Two sidebars open in two panes show two different notes'
 * outlines without clobbering each other.
 *
 * The heading outline is derived from the note's loaded HTML via the pure
 * {@link extractTableOfContents} helper (DOM-free regex, deterministic — the
 * same extractor the legacy singleton `useTocStore` used). It watches the
 * notes-store content cache for THIS note id so the outline refreshes when the
 * editor loads/reloads content. `goto(id)` delegates to the pane's editor
 * surface (registered in `useEditorStore`) to scroll the heading into view.
 */
import { ref, watch, onUnmounted, type Ref } from "vue";
import { useNotesStore } from "@/stores/notes";
import { useEditorStore } from "@/stores/editor";
import { extractTableOfContents, type TocItem } from "@/utils/toc";

/**
 * Wire a per-tab heading outline to the note's loaded content.
 *
 * @param noteId a ref/getter returning the tab's note id (`null` when none).
 * @param tabKey a ref/getter returning the tab's editor-registry key
 * (`tabId`, or `"draft:" + groupId`) so `goto` can resolve THIS pane's editor
 * surface. Optional — `goto` is a no-op when omitted.
 */
export function useNoteToc(
  noteId: Ref<string | null> | (() => string | null),
  tabKey?: Ref<string | null> | (() => string | null)
) {
  const notes = useNotesStore();
  const editorStore = useEditorStore();
  const readId = typeof noteId === "function" ? noteId : () => noteId.value;
  const readKey =
    tabKey === undefined
      ? () => null
      : typeof tabKey === "function"
        ? tabKey
        : () => tabKey.value;

  /** The note's heading outline (derived from loaded HTML). */
  const items = ref<TocItem[]>([]);

  /** Recompute the outline from the loaded content for `noteId`. */
  function refresh(): void {
    const id = readId();
    if (!id) {
      items.value = [];
      return;
    }
    const html = notes.getContent(id)?.html ?? "";
    items.value = extractTableOfContents(html);
  }

  /** Scroll the pane's editor to the heading with ToC `id` + visible `text`
   *  (no-op when no surface is registered for this tab — e.g. the editor
   *  hasn't mounted yet). `text` is the reliable match — our editor strips
   *  heading ids on parse. */
  function goto(id: string, text: string): void {
    const key = readKey();
    const surface = key ? editorStore.getSurface(key) : undefined;
    surface?.scrollToHeading(id, text);
  }

  // Re-derive on note switch + whenever this note's loaded content changes.
  // `immediate` so an already-open note seeds the outline on first mount;
  // `flush: "sync"` so headless tests assert synchronously.
  const stopId = watch(readId, () => refresh(), { immediate: true, flush: "sync" });
  // Watch the loaded HTML for THIS note (a function getter so Vue tracks the
  // reactive `getContent` read inside it).
  const stopContent = watch(
    () => {
      const id = readId();
      return id ? notes.getContent(id)?.html : undefined;
    },
    () => refresh(),
    { flush: "sync" }
  );

  onUnmounted(() => {
    stopId();
    stopContent();
  });

  return { items, refresh, goto };
}