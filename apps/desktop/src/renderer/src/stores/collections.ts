import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import {
  sortCollections,
  toNotebookListItem,
  toTagListItem,
  buildNotebookTree,
  DEFAULT_COLLECTION_SORT_KEY,
  DEFAULT_COLLECTION_SORT_DIR,
  type NotebookListItem,
  type NotebookTreeNode,
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
  /** All notebooks (flat) — for lookups (`selectedLabel`), counts, empty-state.
   *  Sub-notebooks live in here too; the tree is built from `roots` + `children`. */
  const notebooks = ref<NotebookListItem[]>([]);
  /** Root notebooks (no parent) — the top level of the sidebar tree. */
  const roots = ref<NotebookListItem[]>([]);
  /** Lazy per-parent child lists (loaded on expand via `db.relations.from`). */
  const children = ref<Record<string, NotebookListItem[]>>({});
  /** Per-notebook expand state (which rows show their children). */
  const expanded = ref<Set<string>>(new Set());

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

  /** Total notebook count (all, incl. sub-notebooks) for the section header. */
  const notebookCount = computed(() => notebooks.value.length);

  /** The recursive notebook tree (roots + lazy children), sorted per level. */
  const treeNotebooks = computed<NotebookTreeNode[]>(() =>
    buildNotebookTree(
      roots.value,
      new Map(Object.entries(children.value)),
      sortKey.value,
      sortDir.value
    )
  );

  /** Human label of the selected collection (for the notes-list filter chip),
   * or `null` when nothing is selected. */
  const selectedLabel = computed<string | null>(() => {
    const s = selected.value;
    if (!s) return null;
    if (s.type === "notebook") {
      return notebooks.value.find((n) => n.id === s.id)?.title ?? "Notebook";
    }
    return tags.value.find((t) => t.id === s.id)?.title ?? "Tag";
  });

  /** Load notebooks (all + roots), tags and the trash count in parallel. */
  async function load(): Promise<void> {
    const db = getDatabase();
    const [nb, rt, tg, trash] = await Promise.all([
      db.notebooks.all.items().catch(() => []),
      db.notebooks.roots.items().catch(() => []),
      db.tags.all.items().catch(() => []),
      db.trash.all().catch(() => [])
    ]);
    notebooks.value = nb.map(toNotebookListItem);
    roots.value = rt.map(toNotebookListItem);
    tags.value = tg.map(toTagListItem);
    trashCount.value = Array.isArray(trash) ? trash.length : 0;
  }

  /**
   * Load a notebook's sub-notebooks via `db.relations.from({type:"notebook",
   * id}, "notebook").resolve()` (parent→child relation), sorted + stored under
   * `children[id]`. Never throws — a failure leaves any previous child list.
   */
  async function loadChildren(id: string): Promise<void> {
    try {
      const db = getDatabase();
      const kids = await db.relations
        .from({ type: "notebook", id }, "notebook")
        .resolve();
      children.value = { ...children.value, [id]: sortCollections(kids.map(toNotebookListItem), sortKey.value, sortDir.value) };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[collections] loadChildren failed:", e);
    }
  }

  /** Expand/collapse a notebook's sub-tree. Lazy: loads children on first
   *  expand. Idempotent (toggling twice returns to the start). */
  async function toggleExpand(id: string): Promise<void> {
    if (!children.value[id]) await loadChildren(id);
    const next = new Set(expanded.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded.value = next;
  }

  /**
   * Create a sub-notebook under `parentId`: add a notebook, link it parent→child
   * via `db.relations.add`, then reload the parent's children + the all-list +
   * ensure the parent is expanded. Never throws — returns the new id, or `null`.
   */
  async function createSubNotebook(parentId: string): Promise<string | null> {
    try {
      const db = getDatabase();
      const childId = await db.notebooks.add({ title: "New notebook" });
      if (!childId) return null;
      await db.relations.add(
        { type: "notebook", id: parentId },
        { type: "notebook", id: childId }
      );
      await loadChildren(parentId);
      // Ensure the parent is expanded so the new child is visible.
      if (!expanded.value.has(parentId)) {
        const next = new Set(expanded.value);
        next.add(parentId);
        expanded.value = next;
      }
      // Refresh the flat all-list so lookups (selectedLabel, counts) see it.
      const all = await getDatabase().notebooks.all.items().catch(() => []);
      notebooks.value = all.map(toNotebookListItem);
      return childId;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[collections] createSubNotebook failed:", e);
      return null;
    }
  }

  /**
   * Create a new root notebook (tray "New Notebook" / future palette command),
   * then reload so the sidebar lists it. Never throws — returns the new id, or
   * `null` on failure. Mirrors `notes.create()`'s `db.notes.add({ title })`.
   */
  async function createNotebook(): Promise<string | null> {
    try {
      const db = getDatabase();
      const id = await db.notebooks.add({ title: "New notebook" });
      await load();
      return id;
    } catch {
      return null;
    }
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
    roots,
    children,
    expanded,
    tags,
    trashCount,
    sortKey,
    sortDir,
    collapsed,
    selected,
    sortedNotebooks,
    sortedTags,
    notebookCount,
    treeNotebooks,
    selectedLabel,
    load,
    loadChildren,
    toggleExpand,
    createSubNotebook,
    createNotebook,
    toggleSection,
    setSortKey,
    setSortDir,
    select,
    clearSelection
  };
});