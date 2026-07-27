/**
 * Shared HTML5 drag-and-drop helpers for editor *pane* drags (Phase 4.6 —
 * detach-pane-into-window). Mirrors `tab-dnd.ts` but for a whole pane (a group
 * leaf + all its tabs) instead of a single tab.
 *
 * A pane drag is initiated by the grip handle at the leading edge of a pane's
 * tab strip (`NoteTabs.vue`). It carries a JSON payload `{ groupId }` under a
 * custom MIME type (`PANE_MIME`). Using a custom type (not `text/plain`) keeps
 * the OS from treating the drag as a text/URL drag into other apps (Finder
 * etc.). The drag is a *tear-off / cross-window move* gesture only — there are
 * no within-window pane drop targets, so a within-window release is a no-op
 * (the pane stays) and only a release outside the source window tears the pane
 * off into a new window or moves it onto another window.
 *
 * `dataTransfer.types` is the ONLY way to detect a pane drag in `dragover` (the
 * payload isn't readable until `drop` fires), so the MIME constant is shared
 * should any future drop target want to accept pane drags.
 */

export const PANE_MIME = "application/x-notesnook-pane";

export interface PanePayload {
  groupId?: string;
}

/** True when the in-flight drag carries a pane payload. */
export function isPaneDrag(e: DragEvent): boolean {
  return e.dataTransfer?.types?.includes(PANE_MIME) ?? false;
}

/** Read the pane payload (empty object on missing/garbled data). */
export function readPanePayload(e: DragEvent): PanePayload {
  try {
    return JSON.parse(e.dataTransfer?.getData(PANE_MIME) ?? "{}");
  } catch {
    return {};
  }
}

/** Write the pane payload + set `effectAllowed = "move"` (source grip only). */
export function writePanePayload(e: DragEvent, payload: PanePayload): void {
  e.dataTransfer?.setData(PANE_MIME, JSON.stringify(payload));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}

// --- within-window drop handled flag ---------------------------------------
/**
 * A window-scoped flag a within-window pane drop target would set if it
 * consumed a drop. Today there are NO within-window pane drop targets (a pane
 * grip drag only tears off / moves cross-window), so this stays false and the
 * source grip's `dragend` always proceeds to the cross-window `releasePane`
 * call when the drag left the window. The flag exists for parity with
 * `tab-dnd.ts` and so a future within-window pane-reorder drop can suppress the
 * cross-window release without changing the `dragend` contract. Module-level →
 * one flag per renderer process (window); only one pane is dragged at a time.
 */
let paneDropHandled = false;

/** Mark that a within-window drop target consumed the in-flight pane drag. */
export function markPaneDropHandled(): void {
  paneDropHandled = true;
}

/** Read + reset the flag (the source grip's `dragend` calls this once). */
export function consumePaneDropHandled(): boolean {
  const v = paneDropHandled;
  paneDropHandled = false;
  return v;
}

/** Reset the flag (the source grip clears it on `dragstart` to drop stale state). */
export function resetPaneDropHandled(): void {
  paneDropHandled = false;
}