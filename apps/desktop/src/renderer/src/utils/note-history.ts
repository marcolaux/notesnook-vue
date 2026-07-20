/**
 * Pure note-history logic (Phase 5.1) — helpers for the per-note revision-
 * history store that lists / previews / restores note sessions via
 * `db.noteHistory`. Kept framework-agnostic so it is unit-tested in isolation
 * (see `tests/contract/note-history.spec.ts`). The `useNoteHistoryStore`
 * composes these for the active note.
 *
 * A revision is a `HistorySession` (metadata: id, noteId, dateModified, locked)
 * whose body lives in a sibling `SessionContentItem` fetched via
 * `db.noteHistory.content(sessionId)`. The store reads `items()` sorted
 * newest-first; `sortHistoryByDateDesc` is a defensive re-sort so the view is
 * correct even if a caller passes unsorted data.
 */

import type { HistorySession } from "@notesnook-vue/contracts";

/** Slim view of a revision for the properties-panel History section. */
export interface HistoryEntry {
  id: string;
  /** When this revision was saved (dateModified — used for ordering + display). */
  dateModified: number;
  /** True if the revision's content is vault-locked (preview needs a vault unlock). */
  locked: boolean;
}

/** Map a `HistorySession` to the panel's {@link HistoryEntry} view. */
export function toHistoryEntry(s: HistorySession): HistoryEntry {
  return {
    id: s.id,
    dateModified: s.dateModified,
    locked: !!s.locked
  };
}

/**
 * Sort history entries newest-first by `dateModified`. Returns a new array
 * (does not mutate the input). Ties keep their input order (stable sort).
 */
export function sortHistoryByDateDesc(entries: readonly HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort((a, b) => b.dateModified - a.dateModified);
}