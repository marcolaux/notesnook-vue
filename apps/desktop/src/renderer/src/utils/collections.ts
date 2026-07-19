/**
 * Sidebar collection view-logic (Phase 3.2).
 *
 * The sidebar (§4.1) lists Notebooks, Tags, Monographs, Archive and Trash.
 * Notebooks and Tags come from `@notesnook/core`'s `database.notebooks` /
 * `database.tags` collections; this module holds the pure view logic — slim
 * item mappers + a generic sort — shared by the `collections` store and the
 * `Sidebar` component. Mirrors the `utils/notes-list.ts` shape for the
 * collections that have a `pinned` flag (notebooks); tags are flat (no pinned
 * flag, no subtag API) so the pinned-first prefix is a no-op for them.
 *
 * Recursive subnotebooks / subtags are deferred: the current `@notesnook/core`
 * API exposes notebooks + topics as a flat list (no visible parent link on
 * `Notebook`, `Topic` is `@deprecated`), and tags have no hierarchy. The sort
 * + mapper here are written so a future tree pass can nest without changing
 * the leaf shape.
 */
import type { Notebook, Tag } from "@notesnook-vue/contracts";

export type CollectionSortKey = "title" | "dateModified" | "dateCreated";
export type SortDir = "asc" | "desc";

export const DEFAULT_COLLECTION_SORT_KEY: CollectionSortKey = "dateModified";
export const DEFAULT_COLLECTION_SORT_DIR: SortDir = "desc";

/** Minimal shape the generic sorter needs. `pinned` is optional (tags lack
 * it). `dateModified` comes from `BaseItem` (shared by notebooks + tags);
 * `Notebook` also has `dateEdited` but `Tag` does not, so `dateModified` is the
 * common "recently changed" key. */
export interface SortableCollectionItem {
  title: string;
  dateModified: number;
  dateCreated: number;
  pinned?: boolean;
}

export interface NotebookListItem {
  id: string;
  title: string;
  description: string;
  dateCreated: number;
  dateModified: number;
  pinned: boolean;
}

export interface TagListItem {
  id: string;
  title: string;
  dateCreated: number;
  dateModified: number;
}

export function toNotebookListItem(n: Notebook): NotebookListItem {
  return {
    id: n.id,
    title: n.title || "Untitled",
    description: n.description ?? "",
    dateCreated: n.dateCreated,
    dateModified: n.dateModified,
    pinned: n.pinned
  };
}

export function toTagListItem(t: Tag): TagListItem {
  return {
    id: t.id,
    title: t.title || "Untitled",
    dateCreated: t.dateCreated,
    dateModified: t.dateModified
  };
}

function compare(a: SortableCollectionItem, b: SortableCollectionItem, key: CollectionSortKey): number {
  switch (key) {
    case "title":
      return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
    case "dateCreated":
      return a.dateCreated - b.dateCreated;
    case "dateModified":
    default:
      return a.dateModified - b.dateModified;
  }
}

/**
 * Sort collection items, **pinned-first** (independent of the sort key —
 * pinned items stay on top regardless of direction, matching Notesnook), then
 * by `key` in `dir` order. Non-mutating (spread + sort).
 *
 * Tags lack a `pinned` flag; the pinned-first split is a no-op for them.
 */
export function sortCollections<T extends SortableCollectionItem>(
  items: readonly T[],
  key: CollectionSortKey,
  dir: SortDir
): T[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    // Pinned-first prefix (only meaningful when both sides declare `pinned`).
    const aPinned = a.pinned === true;
    const bPinned = b.pinned === true;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return compare(a, b, key) * factor;
  });
}