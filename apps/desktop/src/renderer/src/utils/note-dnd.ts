/**
 * Shared HTML5 drag-and-drop helpers for dragging notes from the notes list.
 *
 * A note drag carries a JSON payload `{ ids: string[] }` under a custom MIME
 * type (`NOTE_MIME`). Using a custom type (not `text/plain`) keeps the OS from
 * treating the drag as a text/URL drag into other apps (Finder etc.), and lets
 * sidebar drop targets (`NotebookNode`, the tag/color rows, the Archive/Trash
 * links) distinguish a note drag from a sidebar-reorder drag
 * (`application/x-notesnook-sidebar`) or a tab drag (`application/x-notesnook-tab`).
 *
 * `dataTransfer.types` is the ONLY way to detect a note drag in `dragover` (the
 * payload isn't readable until `drop` fires), so the MIME constant is shared
 * between the source (`NotesList`) and every drop target — same convention as
 * `tab-dnd.ts` and `sidebar-order.ts`.
 *
 * The payload carries the full dragged set: when the grabbed row is part of the
 * current multi-selection, every selected note id travels with the drag; the
 * drop handler applies the action to all of them (file-manager semantics).
 */

export const NOTE_MIME = "application/x-notesnook-note";

export interface NoteDragPayload {
  /** Note ids being dragged (one or many). */
  ids: string[];
}

/** True when the in-flight drag carries a note payload (any sidebar target can
 *  accept; reorder/tab handlers ignore it because they guard on their own MIME). */
export function isNoteDrag(e: DragEvent): boolean {
  return e.dataTransfer?.types?.includes(NOTE_MIME) ?? false;
}

/** Read + validate the note payload (null on missing/garbled data or empty ids). */
export function readNotePayload(e: DragEvent): NoteDragPayload | null {
  try {
    const raw = e.dataTransfer?.getData(NOTE_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NoteDragPayload;
    if (!parsed || !Array.isArray(parsed.ids) || parsed.ids.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Write the note payload + set `effectAllowed = "move"` (notes-list source only). */
export function writeNotePayload(e: DragEvent, payload: NoteDragPayload): void {
  e.dataTransfer?.setData(NOTE_MIME, JSON.stringify(payload));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}

// --- within-window drop handled flag ---------------------------------------
/**
 * A window-scoped flag set by any within-window note-drop target when it
 * actually consumes a drop (the sidebar notebook/tag/color/archive/trash
 * handlers). The note row's `dragend` reads + resets it to decide whether the
 * drag ended on a within-window target (an assignment — fully handled, so skip
 * the cross-window `releaseTab` call) or landed elsewhere (another window →
 * open there; outside every window → tear off into a new window).
 *
 * This mirrors `tab-dnd.ts`'s `tabDropHandled` and is used for the same reason:
 * `dropEffect` is sticky from the last `dragover` inside the source window, so
 * it stays `"move"` even when the cursor leaves the window over a drop zone —
 * which would falsely signal a within-window drop. `drop` fires before
 * `dragend`, so the flag is set by the time `dragend` runs (and stays false for
 * a cross-window drop, where no within-window handler fires). Module-level →
 * one flag per renderer process (window); only one note is dragged at a time.
 *
 * Belt-and-suspenders with the main-side `resolveTabRelease` predicate, which
 * independently returns `"none"` when the live cursor ends inside the source
 * window — but the flag avoids a redundant IPC round-trip per sidebar drop and
 * is the explicit signal that a target consumed the drop.
 */
let noteDropHandled = false;

/** Mark that a within-window drop target consumed the in-flight note drag. */
export function markNoteDropHandled(): void {
  noteDropHandled = true;
}

/** Read + reset the flag (the note row's `dragend` calls this once). */
export function consumeNoteDropHandled(): boolean {
  const v = noteDropHandled;
  noteDropHandled = false;
  return v;
}

/** Reset the flag (the note row clears it on `dragstart` to drop stale state). */
export function resetNoteDropHandled(): void {
  noteDropHandled = false;
}