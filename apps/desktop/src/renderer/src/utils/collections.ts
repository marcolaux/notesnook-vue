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
 * Recursive **sub-notebooks** are nested notebooks linked parent→child via
 * `db.relations` (`{type:"notebook", id: parent} → {type:"notebook", id: child}`;
 * `Topic` is `@deprecated`). `buildNotebookTree` below nests roots + a lazy
 * children map.
 *
 * **Hierarchical tags** are a pure client-side view transform: tags have no
 * upstream hierarchy, but a tag whose `title` contains a `/` (e.g. `task/todo`)
 * is rendered as a sub-tag of its first segment. `buildTagTree` below splits
 * each title on `/` and nests by prefix. A parent segment that has no real tag
 * of its own becomes a grouping-only node (`tag: null`) — still selectable
 * (filters to all descendants) but not renameable/deletable/pinnable.
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
 *
 * When a non-empty `order` is supplied, it overlays a **manual sort** within
 * each pinned group: items whose id is in `order` come first (in `order`'s
 * sequence), ahead of unlisted items (which keep the `key`/`dir` tiebreak).
 * Pinned-first still wins over manual order — a pinned row floats to the top
 * regardless of its manual position. An empty/absent `order` is a no-op (the
 * plain column sort applies). Used by the root Notebooks list (local-only
 * manual reorder via `localStorage`; see `NOTEBOOK_ORDER_KEY`).
 */
export function sortCollections<T extends SortableCollectionItem>(
  items: readonly T[],
  key: CollectionSortKey,
  dir: SortDir,
  order?: readonly string[]
): T[] {
  const factor = dir === "asc" ? 1 : -1;
  const manual = order && order.length > 0 ? new Map(order.map((id, i) => [id, i])) : null;
  return [...items].sort((a, b) => {
    // Pinned-first prefix (only meaningful when both sides declare `pinned`).
    const aPinned = a.pinned === true;
    const bPinned = b.pinned === true;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (manual) {
      const ai = manual.get((a as { id?: string }).id ?? "");
      const bi = manual.get((b as { id?: string }).id ?? "");
      const aHas = ai !== undefined;
      const bHas = bi !== undefined;
      if (aHas && bHas) return (ai as number) - (bi as number);
      if (aHas) return -1;
      if (bHas) return 1; // unlisted items fall after listed, kept in key/dir order
    }
    return compare(a, b, key) * factor;
  });
}

/**
 * A notebook rendered as a tree node (its slim view + its nested sub-notebooks).
 * Sub-notebooks are notebooks linked parent→child via `db.relations`
 * (`{type:"notebook", id: parent} → {type:"notebook", id: child}`); the sidebar
 * loads roots (`db.notebooks.roots`) and each notebook's children lazily
 * (`db.relations.from({type:"notebook", id}, "notebook").resolve()`).
 */
export interface NotebookTreeNode {
  item: NotebookListItem;
  children: NotebookTreeNode[];
}

/**
 * Build a notebook tree from the roots + a lazy `childrenOf` map (parent id →
 * its child items, loaded on expand). Roots + each level's children are sorted
 * via the existing {@link sortCollections} (pinned-first + key/dir). Leaves get
 * `children: []`. Non-mutating; a node whose children haven't been loaded yet
 * (absent from the map) renders as a leaf until expanded.
 *
 * `order` (optional) applies a **manual sort overlay to the roots only**
 * (pinned-first preserved within the root group) — the sidebar's local-only
 * drag-reorder. Children levels keep the plain column sort (a per-parent manual
 * order is a documented follow-up).
 */
export function buildNotebookTree(
  roots: readonly NotebookListItem[],
  childrenOf: ReadonlyMap<string, NotebookListItem[]>,
  key: CollectionSortKey,
  dir: SortDir,
  order?: readonly string[]
): NotebookTreeNode[] {
  const build = (item: NotebookListItem): NotebookTreeNode => {
    const raw = childrenOf.get(item.id) ?? [];
    const sorted = sortCollections(raw, key, dir);
    return { item, children: sorted.map(build) };
  };
  return sortCollections(roots, key, dir, order).map(build);
}

// --- hierarchical tags (client-side, slash-in-title) ------------------------
/**
 * A tag rendered as a tree node. Unlike {@link NotebookTreeNode} there is no
 * upstream hierarchy — the tree is built purely by splitting each tag's
 * `title` on `/`. A node whose path matches a real tag's title carries that
 * `tag`; a parent prefix with no real tag of its own is a **grouping-only**
 * node (`tag: null`) — selectable (filters to all descendants) but not
 * renameable/deletable/pinnable.
 *
 * `dateModified`/`dateCreated` make the node a {@link SortableCollectionItem}
 * (so {@link sortCollections} works on it): the real tag's timestamps if it
 * has one, else the **max** across descendants (a grouping node sorts by its
 * most-recently-changed child). `title` (for the sorter) is the `label`.
 */
export interface TagTreeNode {
  /** Slash-joined full path, e.g. `"task/todo"`. Unique tree key. */
  path: string;
  /** Display label = final path segment, e.g. `"todo"`. */
  label: string;
  /** The real tag at exactly this path, or `null` for a grouping-only node. */
  tag: TagListItem | null;
  children: TagTreeNode[];
  dateModified: number;
  dateCreated: number;
  /** `= label`; satisfies {@link SortableCollectionItem} so {@link sortCollections}
   *  can sort nodes by their display segment (the "title" sort key). Distinct
   *  from `tag.title` (the full path) on purpose. */
  title: string;
}

/**
 * Build a tag tree by nesting tags on the `/` in their titles (`task/todo` →
 * `task › todo`). Pure client-side transform — no `db.relations` involved.
 *
 * Each real tag is inserted at its `title.split("/")` path; a node's `tag` is
 * set only when a real tag's title equals the node's full path. Grouping-only
 * parents (a prefix with no real tag) get `tag: null`. Levels are sorted via
 * {@link sortCollections} (pinned-first is a no-op for tags — no `pinned`
 * flag). Non-mutating.
 *
 * Tag titles are unique upstream (`db.tags.add` throws on a duplicate), so a
 * full path is a unique key — no merge collisions.
 */
export function buildTagTree(
  tags: readonly TagListItem[],
  key: CollectionSortKey,
  dir: SortDir
): TagTreeNode[] {
  // Mutable trie node: children by segment; `tag` attached when a real tag
  // lands exactly at this path.
  interface Trie {
    children: Map<string, Trie>;
    tag: TagListItem | null;
  }
  const root: Trie = { children: new Map(), tag: null };
  for (const tag of tags) {
    const title = tag.title || "Untitled";
    const segments = title.split("/");
    let node = root;
    for (const seg of segments) {
      let child = node.children.get(seg);
      if (!child) {
        child = { children: new Map(), tag: null };
        node.children.set(seg, child);
      }
      node = child;
    }
    node.tag = tag; // a real tag lives at its full title path
  }

  // Recursively materialize the trie into sorted TagTreeNodes, deriving
  // timestamps for grouping-only nodes from their descendants.
  const build = (trie: Trie, path: string): TagTreeNode => {
    // `path` is always non-empty here (top-level passes a non-empty trie key,
    // recursion appends `/seg`), so `pop()` always yields the final segment.
    const label = path.split("/").pop() ?? "";
    const childEntries = Array.from(trie.children.entries());
    const built = childEntries.map(([seg, child]) =>
      build(child, path ? `${path}/${seg}` : seg)
    );
    // Sort each level via sortCollections (pinned-first is a no-op for tags),
    // mirroring buildNotebookTree's per-level sort.
    const children = sortCollections(built, key, dir);
    // Timestamps: the real tag's if present, else the most-recent descendant.
    let dateModified = trie.tag?.dateModified ?? 0;
    let dateCreated = trie.tag?.dateCreated ?? 0;
    if (!trie.tag) {
      for (const c of children) {
        dateModified = Math.max(dateModified, c.dateModified);
        dateCreated = Math.max(dateCreated, c.dateCreated);
      }
    }
    return {
      path,
      label,
      tag: trie.tag,
      children,
      dateModified,
      dateCreated,
      title: label
    };
  };

  const topLevel = Array.from(root.children.entries()).map(([seg, child]) =>
    build(child, seg)
  );
  return sortCollections(topLevel, key, dir);
}

// --- notebooks manual order (local-only, localStorage) ----------------------
/**
 * localStorage key for the sidebar's manual root-notebook order. A JSON array
 * of root notebook ids; `[]` (or missing/unparseable) → no manual order (the
 * column sort wins). This is **local-only** — upstream's `db.settings.set`
 * rejects unknown keys (no `sideBarOrder:notebooks` exists in core's
 * `defaultSettings`), and `SideBarSection` excludes `"notebooks"`, so a manual
 * notebook order does NOT round-trip through upstream sync (by design). Shared
 * across same-origin Electron windows like the theme-mode key.
 */
export const NOTEBOOK_ORDER_KEY = "notesnook.notebookOrder";

/** Read the stored manual root-notebook order, or `[]` on a miss/parse
 *  failure/missing localStorage. Never throws. */
export function readNotebookOrder(): string[] {
  try {
    const raw = localStorage.getItem(NOTEBOOK_ORDER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed as string[];
    }
    return [];
  } catch {
    return [];
  }
}

/** Persist the manual root-notebook order (a JSON id array). Best-effort —
 *  persistence is optional (the store keeps the value in memory regardless). */
export function writeNotebookOrder(ids: string[]): void {
  try {
    localStorage.setItem(NOTEBOOK_ORDER_KEY, JSON.stringify(ids));
  } catch {
    /* best-effort */
  }
}

/** Clear the stored manual root-notebook order (back to the column sort). */
export function clearNotebookOrder(): void {
  try {
    localStorage.removeItem(NOTEBOOK_ORDER_KEY);
  } catch {
    /* best-effort */
  }
}