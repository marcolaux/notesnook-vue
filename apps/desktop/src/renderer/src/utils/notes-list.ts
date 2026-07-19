/**
 * Pure notes-list view logic (Phase 3.3) — search (plain + regex) and sort for
 * the `NotesList`. Kept framework-agnostic so it is unit-tested in isolation
 * (see `tests/contract/notes-list.spec.ts`) and reusable by the palette's
 * "Search notes" command. The store (`stores/notes.ts`) composes these into a
 * reactive `visibleItems` computed.
 */
import type { NoteListItem } from "@/stores/notes";

export type SortKey = "dateEdited" | "dateCreated" | "title";
export type SortDir = "asc" | "desc";

export interface SearchOptions {
  /** Treat `query` as a RegExp source (with `u` flag). Invalid regex falls
   * back to a plain case-insensitive substring search. */
  regex: boolean;
}

/** Default list view state — edited-most-recent-first, plain search. */
export const DEFAULT_SORT_KEY: SortKey = "dateEdited";
export const DEFAULT_SORT_DIR: SortDir = "desc";

/**
 * Case-insensitive substring search across title + headline + tags. An empty
 * query matches everything. Returns the items unchanged (same references) when
 * the query is empty so the list isn't needlessly re-filtered.
 */
export function filterNotes(
  items: readonly NoteListItem[],
  query: string,
  { regex }: SearchOptions
): NoteListItem[] {
  const q = query.trim();
  if (q === "") return [...items];
  if (regex) {
    let re: RegExp;
    try {
      re = new RegExp(q, "u");
    } catch {
      // Invalid regex → fall back to plain substring (don't silently empty
      // the list while the user is mid-typing a pattern).
      return plainFilter(items, q);
    }
    return items.filter((n) => re.test(n.title) || re.test(n.headline) || n.tags.some((t) => re.test(t)));
  }
  return plainFilter(items, q);
}

function plainFilter(items: readonly NoteListItem[], q: string): NoteListItem[] {
  const needle = q.toLowerCase();
  return items.filter((n) => {
    if (n.title.toLowerCase().includes(needle)) return true;
    if (n.headline.toLowerCase().includes(needle)) return true;
    return n.tags.some((t) => t.toLowerCase().includes(needle));
  });
}

/**
 * Sort by the given key + direction. **Pinned notes are always kept on top**
 * (within their group, the sort still applies) — matches Notesnook's sticky
 * pinned-note behaviour and is independent of the chosen sort key/direction.
 * Returns a new array; the input is not mutated.
 */
export function sortNotes(
  items: readonly NoteListItem[],
  key: SortKey,
  dir: SortDir
): NoteListItem[] {
  const factor = dir === "asc" ? 1 : -1;
  const cmp = (a: NoteListItem, b: NoteListItem): number => {
    switch (key) {
      case "title":
        return factor * a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
      case "dateCreated":
        return factor * (a.dateCreated - b.dateCreated);
      case "dateEdited":
      default:
        return factor * (a.dateEdited - b.dateEdited);
    }
  };
  return [...items].sort((a, b) => {
    // Pinned group first; within a group the chosen comparator decides.
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return cmp(a, b);
  });
}