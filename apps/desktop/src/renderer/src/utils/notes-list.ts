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
 * List grouping (Phase 3.3 follow-up). `none` renders a flat list (the
 * pre-grouping behaviour); `date` buckets entries by how long ago they were
 * last edited. Notebook/tag grouping is deferred — the API exposes notebooks
 * and tags flat (no per-note membership index), so date grouping is the only
 * mode derivable purely from {@link NoteListItem}.
 */
export type GroupKey = "none" | "date";

export const DEFAULT_GROUP_KEY: GroupKey = "none";

export interface NoteGroup {
  /** Stable bucket id ("" for the flat `none` group, else e.g. "today"). */
  key: string;
  /** Human-readable header label ("" for the flat group → no header renders). */
  label: string;
  items: NoteListItem[];
}

/** Display order + labels for the date buckets. */
const DATE_BUCKETS: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this-week", label: "Earlier this week" },
  { key: "this-month", label: "Earlier this month" },
  { key: "this-year", label: "Earlier this year" },
  { key: "older", label: "Older" }
];

function midnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Bucket a timestamp into a date-group id. Calendar-based (not 24h-relative)
 * so "Today"/"Yesterday" respect the user's local day boundary. Future-dated
 * notes fall into "today". `now` is injectable for deterministic tests.
 */
export function dateBucket(dateEdited: number, now: number = Date.now()): string {
  const itemTs = dateEdited;
  const nowDate = new Date(now);
  const itemDate = new Date(itemTs);
  const todayMid = midnight(nowDate);
  const itemMid = midnight(itemDate);
  const dayDiff = Math.round((todayMid - itemMid) / 86_400_000);
  if (dayDiff <= 0) return "today";
  if (dayDiff === 1) return "yesterday";
  // Same calendar week (Monday-based), but not today/yesterday.
  const weekStart = todayMid - (((nowDate.getDay() + 6) % 7) * 86_400_000);
  if (itemMid >= weekStart) return "this-week";
  if (itemDate.getFullYear() === nowDate.getFullYear() && itemDate.getMonth() === nowDate.getMonth()) {
    return "this-month";
  }
  if (itemDate.getFullYear() === nowDate.getFullYear()) return "this-year";
  return "older";
}

/**
 * Group already-sorted items under headers. With `key === "none"` a single
 * headerless group is returned (or `[]` when empty) so the list renders flat.
 * For `date`, items keep their sort order within each bucket; buckets appear
 * in chronological recency order and empty buckets are omitted. Non-mutating.
 */
export function groupNotes(
  items: readonly NoteListItem[],
  key: GroupKey,
  now: number = Date.now()
): NoteGroup[] {
  if (key === "none") {
    return items.length ? [{ key: "", label: "", items: [...items] }] : [];
  }
  const buckets = new Map<string, NoteListItem[]>();
  for (const n of items) {
    const b = dateBucket(n.dateEdited || n.dateCreated, now);
    let arr = buckets.get(b);
    if (!arr) {
      arr = [];
      buckets.set(b, arr);
    }
    arr.push(n);
  }
  return DATE_BUCKETS.filter((b) => buckets.has(b.key)).map((b) => ({
    key: b.key,
    label: b.label,
    items: buckets.get(b.key)!
  }));
}

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