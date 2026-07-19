import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import {
  sortCollections,
  toNotebookListItem,
  toTagListItem,
  DEFAULT_COLLECTION_SORT_KEY,
  DEFAULT_COLLECTION_SORT_DIR,
  type NotebookListItem,
  type TagListItem,
  type CollectionSortKey,
  type SortDir
} from "@/utils/collections";

/**
 * Sidebar collections store (Phase 3.2). Loads notebooks, tags and the trash
 * count from `@notesnook/core`, holds the sidebar view state (per-section
 * collapse, the currently-selected collection) and exposes pinned-first /
 * title / date sorted views for the `Sidebar` component.
 *
 * Selecting a notebook or tag records it here (`selected`); routing to the
 * notes view and filtering the notes list by the selected collection is the
 * next increment (needs `database.notebooks.notes(id)` + a notes-store
 * filter-by-id-set). Subnotebooks / subtags are deferred (flat API today).
 */
export type CollectionType = "notebook" | "tag";

export interface SelectedCollection {
  type: CollectionType;
  id: string;
}

/** Sidebar sections that can be collapsed. */
export type CollectionSection = "notebooks" | "tags";

export const useCollectionsStore = defineStore("collections", () => {
  const notebooks = ref<NotebookListItem[]>([]);
  const tags = ref<TagListItem[]>([]);
  const trashCount = ref(0);

  const sortKey = ref<CollectionSortKey>(DEFAULT_COLLECTION_SORT_KEY);
  const sortDir = ref<SortDir>(DEFAULT_COLLECTION_SORT_DIR);

  /** Per-section collapse state; expanded by default. */
  const collapsed = ref<Record<CollectionSection, boolean>>({
    notebooks: false,
    tags: false
  });

  /** Currently-selected collection (highlight + future note filter). */
  const selected = ref<SelectedCollection | null>(null);

  const sortedNotebooks = computed<NotebookListItem[]>(() =>
    sortCollections(notebooks.value, sortKey.value, sortDir.value)
  );
  const sortedTags = computed<TagListItem[]>(() =>
    sortCollections(tags.value, sortKey.value, sortDir.value)
  );

  /** Load notebooks, tags and the trash count in parallel. */
  async function load(): Promise<void> {
    const db = getDatabase();
    const [nb, tg, trash] = await Promise.all([
      db.notebooks.all.items().catch(() => []),
      db.tags.all.items().catch(() => []),
      db.trash.all().catch(() => [])
    ]);
    notebooks.value = nb.map(toNotebookListItem);
    tags.value = tg.map(toTagListItem);
    trashCount.value = Array.isArray(trash) ? trash.length : 0;
  }

  function toggleSection(section: CollectionSection): void {
    collapsed.value = { ...collapsed.value, [section]: !collapsed.value[section] };
  }

  function setSortKey(key: CollectionSortKey): void {
    sortKey.value = key;
  }

  function setSortDir(dir: SortDir): void {
    sortDir.value = dir;
  }

  /** Select a collection (or clear with `null`). The Sidebar routes to `/all`. */
  function select(type: CollectionType, id: string): void {
    selected.value = { type, id };
  }

  function clearSelection(): void {
    selected.value = null;
  }

  return {
    notebooks,
    tags,
    trashCount,
    sortKey,
    sortDir,
    collapsed,
    selected,
    sortedNotebooks,
    sortedTags,
    load,
    toggleSection,
    setSortKey,
    setSortDir,
    select,
    clearSelection
  };
});