import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import {
  sortCollections,
  toNotebookListItem,
  toTagListItem,
  buildNotebookTree,
  readNotebookOrder,
  writeNotebookOrder,
  clearNotebookOrder,
  DEFAULT_COLLECTION_SORT_KEY,
  DEFAULT_COLLECTION_SORT_DIR,
  type NotebookListItem,
  type NotebookTreeNode,
  type TagListItem,
  type CollectionSortKey,
  type SortDir
} from "@/utils/collections";
import { moveIdTo } from "@/utils/sidebar-order";

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
export type CollectionType = "notebook" | "tag" | "color";

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
  const archiveCount = ref(0);

  const sortKey = ref<CollectionSortKey>(DEFAULT_COLLECTION_SORT_KEY);
  const sortDir = ref<SortDir>(DEFAULT_COLLECTION_SORT_DIR);

  /** Manual order of root notebook ids (local-only, `localStorage`). Empty →
   *  the column sort wins; non-empty → overlays a manual sort on the roots
   *  (pinned-first preserved). Loaded in `load`, set by `moveNotebookTo`. */
  const notebookOrder = ref<string[]>([]);

  /** Per-section collapse state; expanded by default. */
  const collapsed = ref<Record<CollectionSection, boolean>>({
    notebooks: false,
    tags: false
  });

  /** Currently-selected collection (highlight + future note filter). */
  const selected = ref<SelectedCollection | null>(null);

  /** Inline-rename state for a notebook/tag row (the row swaps its label for an
   *  `<input>` while this is set). Cleared by `commitRename` / `cancelRename`.
   *  Owned here (not component-local) so it survives `NotebookNode` recursion +
   *  applies uniformly to the tag rows in `Sidebar.vue`. */
  const renaming = ref<{ kind: CollectionType; id: string; text: string } | null>(null);

  const sortedNotebooks = computed<NotebookListItem[]>(() =>
    sortCollections(notebooks.value, sortKey.value, sortDir.value)
  );
  const sortedTags = computed<TagListItem[]>(() =>
    sortCollections(tags.value, sortKey.value, sortDir.value)
  );

  /** Total notebook count (all, incl. sub-notebooks) for the section header. */
  const notebookCount = computed(() => notebooks.value.length);

  /** The recursive notebook tree (roots + lazy children), sorted per level.
   *  Roots additionally honour the local-only manual order (`notebookOrder`). */
  const treeNotebooks = computed<NotebookTreeNode[]>(() =>
    buildNotebookTree(
      roots.value,
      new Map(Object.entries(children.value)),
      sortKey.value,
      sortDir.value,
      notebookOrder.value
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

  /** Load notebooks (all + roots), tags, the trash count, and the archive
   *  count in parallel. */
  async function load(): Promise<void> {
    const db = getDatabase();
    const [nb, rt, tg, trash, archivedIds] = await Promise.all([
      db.notebooks.all.items().catch(() => []),
      db.notebooks.roots.items().catch(() => []),
      db.tags.all.items().catch(() => []),
      db.trash.all().catch(() => []),
      db.notes.archived.ids().catch(() => [])
    ]);
    notebooks.value = nb.map(toNotebookListItem);
    roots.value = rt.map(toNotebookListItem);
    tags.value = tg.map(toTagListItem);
    trashCount.value = Array.isArray(trash) ? trash.length : 0;
    archiveCount.value = Array.isArray(archivedIds) ? archivedIds.length : 0;
    notebookOrder.value = readNotebookOrder();
  }

  /** Refresh just the sidebar trash badge (a `db.trash.all()` count) without
   *  reloading notebooks/tags. Used by the TrashView after a restore/delete so
   *  the badge stays in sync without a full `load()`. Never throws. */
  async function reloadTrashCount(): Promise<void> {
    try {
      const db = getDatabase();
      const trash = await db.trash.all().catch(() => []);
      trashCount.value = Array.isArray(trash) ? trash.length : 0;
    } catch {
      /* leave the previous count intact */
    }
  }

  /** Refresh just the sidebar archive badge (a `db.notes.archived.ids()`
   *  count) without reloading notebooks/tags. Used after an archive/unarchive
   *  so the badge stays in sync without a full `load()`. The archived selector
   *  is cache-backed, so `.ids()` is cheap. Never throws. */
  async function reloadArchiveCount(): Promise<void> {
    try {
      const db = getDatabase();
      const archivedIds = await db.notes.archived.ids().catch(() => []);
      archiveCount.value = Array.isArray(archivedIds) ? archivedIds.length : 0;
    } catch {
      /* leave the previous count intact */
    }
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

  /**
   * Reload the flat all-list, the roots, and every expanded parent's children.
   * Used after a notebook mutation (rename/delete/pin) so the sidebar reflects
   * it without a full `load()` (trash count is unaffected). Never throws — a
   * failure leaves the previous state intact (per-loader behaviour).
   */
  async function reloadNotebooks(): Promise<void> {
    const db = getDatabase();
    const [all, rt] = await Promise.all([
      db.notebooks.all.items().catch(() => []),
      db.notebooks.roots.items().catch(() => [])
    ]);
    notebooks.value = all.map(toNotebookListItem);
    roots.value = rt.map(toNotebookListItem);
    // Re-load children for every expanded parent so a renamed/deleted/re-pinned
    // child reflects in the tree (children lists hold their own item copies).
    await Promise.all(
      Array.from(expanded.value).map((id) => loadChildren(id))
    );
  }

  /** Reload only the tags list (used after a tag rename/delete). Never throws. */
  async function reloadTags(): Promise<void> {
    const db = getDatabase();
    const tg = await db.tags.all.items().catch(() => []);
    tags.value = tg.map(toTagListItem);
  }

  /**
   * Rename a notebook via `db.notebooks.add({id, title})` (upsert-by-id is
   * core's rename path — there is no dedicated `rename`), then reload so the
   * sidebar + tree show the new title. Never throws — returns `true` on success.
   */
  async function renameNotebook(id: string, title: string): Promise<boolean> {
    const trimmed = title.trim();
    if (!trimmed) return false;
    try {
      const db = getDatabase();
      await db.notebooks.add({ id, title: trimmed });
      await reloadNotebooks();
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[collections] renameNotebook failed:", e);
      return false;
    }
  }

  /**
   * Delete a notebook via `db.notebooks.remove(id)` (core cascades to its
   * sub-notebooks), then reload. Never throws — returns `true` on success.
   */
  async function deleteNotebook(id: string): Promise<boolean> {
    if (!id) return false;
    try {
      const db = getDatabase();
      await db.notebooks.remove(id);
      // Drop any stale expand/children state for the deleted notebook.
      if (expanded.value.has(id)) {
        const next = new Set(expanded.value);
        next.delete(id);
        expanded.value = next;
      }
      const { [id]: _omit, ...rest } = children.value;
      children.value = rest;
      await reloadNotebooks();
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[collections] deleteNotebook failed:", e);
      return false;
    }
  }

  /**
   * Toggle a notebook's pinned-to-top flag (📌 — the pinned-first sort prefix,
   * distinct from the ★ shortcut pin) via `db.notebooks.pin(state, id)`, then
   * reload so the tree re-sorts. Never throws — returns `true` on success.
   */
  async function toggleNotebookPinned(id: string): Promise<boolean> {
    if (!id) return false;
    try {
      const db = getDatabase();
      const current = notebooks.value.find((n) => n.id === id)?.pinned ?? false;
      await db.notebooks.pin(!current, id);
      await reloadNotebooks();
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[collections] toggleNotebookPinned failed:", e);
      return false;
    }
  }

  /**
   * Manually reorder a **root** notebook: move `fromId` to a position relative
   * `toId` (`before` → immediately ahead, else immediately after) in the
   * currently-displayed root order, then persist the resulting id sequence to
   * `localStorage` (local-only — does NOT sync). The sidebar root-row drop
   * handler calls this. No-op when `from`/`to` are missing or equal. Does not
   * touch the DB — purely a view-order overlay kept in `notebookOrder`.
   */
  function moveNotebookTo(fromId: string, toId: string, before: boolean): void {
    if (!fromId || !toId || fromId === toId) return;
    const current = treeNotebooks.value.map((n) => n.item.id);
    const next = moveIdTo(current, fromId, toId, before);
    notebookOrder.value = next;
    writeNotebookOrder(next);
  }

  /** Clear the manual root-notebook order (back to the column sort). Local-only. */
  function resetNotebookOrder(): void {
    notebookOrder.value = [];
    clearNotebookOrder();
  }

  /** Note count for a notebook via `db.notebooks.totalNotes(id)` (recurses
   *  descendants). Never throws — returns `0` on failure. */
  async function notebookNoteCount(id: string): Promise<number> {
    if (!id) return 0;
    try {
      const db = getDatabase();
      const n = await db.notebooks.totalNotes(id);
      return typeof n === "number" ? n : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Rename a tag via `db.tags.add({id, title})` (upsert-by-id; core throws on a
   * title collision with another tag), then reload the tags list. Returns
   * `true` on success, `false` on failure (e.g. duplicate title).
   */
  async function renameTag(id: string, title: string): Promise<boolean> {
    const trimmed = title.trim();
    if (!trimmed) return false;
    try {
      const db = getDatabase();
      await db.tags.add({ id, title: trimmed });
      await reloadTags();
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[collections] renameTag failed:", e);
      return false;
    }
  }

  /**
   * Delete a tag via `db.tags.remove(id)` (core unlinks its note relations +
   * soft-deletes), then reload the tags list. Never throws — returns `true`.
   */
  async function deleteTag(id: string): Promise<boolean> {
    if (!id) return false;
    try {
      const db = getDatabase();
      await db.tags.remove(id);
      await reloadTags();
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[collections] deleteTag failed:", e);
      return false;
    }
  }

  /** Note count for a tag via `db.relations.to({tag}, "note").resolve()` (the
   *  `Note.tags` field is `@deprecated`). Never throws — returns `0`. */
  async function tagNoteCount(id: string): Promise<number> {
    if (!id) return 0;
    try {
      const db = getDatabase();
      const notes = await db.relations.to({ id, type: "tag" }, "note").resolve();
      return Array.isArray(notes) ? notes.length : 0;
    } catch {
      return 0;
    }
  }

  /** Begin inline-rename for a notebook/tag row (seeds the input with the
   *  current title). Only one row is editable at a time. */
  function startRename(kind: CollectionType, id: string, currentTitle: string): void {
    renaming.value = { kind, id, text: currentTitle };
  }

  /** Update the in-progress rename text (bound to the row's `<input>`). */
  function setRenameText(text: string): void {
    if (renaming.value) renaming.value = { ...renaming.value, text };
  }

  /** Commit the in-progress rename: if the trimmed text changed + is non-empty,
   *  calls the matching rename wrapper, then clears the editing state. No-op
   *  when nothing is being renamed. Never throws. */
  async function commitRename(): Promise<void> {
    const r = renaming.value;
    if (!r) return;
    const trimmed = r.text.trim();
    if (trimmed) {
      if (r.kind === "notebook") await renameNotebook(r.id, trimmed);
      else await renameTag(r.id, trimmed);
    }
    renaming.value = null;
  }

  /** Cancel the in-progress rename (Esc / blur). */
  function cancelRename(): void {
    renaming.value = null;
  }

  return {
    notebooks,
    roots,
    children,
    expanded,
    tags,
    trashCount,
    archiveCount,
    sortKey,
    sortDir,
    notebookOrder,
    collapsed,
    selected,
    renaming,
    sortedNotebooks,
    sortedTags,
    notebookCount,
    treeNotebooks,
    selectedLabel,
    load,
    reloadTrashCount,
    reloadArchiveCount,
    loadChildren,
    toggleExpand,
    createSubNotebook,
    createNotebook,
    toggleSection,
    setSortKey,
    setSortDir,
    select,
    clearSelection,
    reloadNotebooks,
    reloadTags,
    renameNotebook,
    deleteNotebook,
    toggleNotebookPinned,
    moveNotebookTo,
    resetNotebookOrder,
    notebookNoteCount,
    renameTag,
    deleteTag,
    tagNoteCount,
    startRename,
    setRenameText,
    commitRename,
    cancelRename
  };
});