/**
 * Shared HTML5 drag-and-drop helpers for editor tab drags (Phase 4.2/4.3).
 *
 * A tab drag carries a JSON payload `{ tabId, groupId, noteId }` under a custom
 * MIME type (`TAB_MIME`). Using a custom type (not `text/plain`) keeps the OS
 * from treating the drag as a text/URL drag into other apps (Finder etc.). The
 * payload is read by any tab strip (`NoteTabs`) for reorder/move AND by any
 * editor pane (`EditorPane`) for split/move drop zones — the drag state is NOT
 * local to the source instance, so a tab can be dropped on a different pane's
 * strip or pane body.
 *
 * `dataTransfer.types` is the ONLY way to detect a tab drag in `dragover` (the
 * payload isn't readable until `drop` fires), so the MIME constant is shared
 * between every drop target.
 */

export const TAB_MIME = "application/x-notesnook-tab";

export interface TabPayload {
  tabId?: string;
  groupId?: string;
  noteId?: string;
}

/** True when the in-flight drag carries a tab payload (any strip/pane can accept). */
export function isTabDrag(e: DragEvent): boolean {
  return e.dataTransfer?.types?.includes(TAB_MIME) ?? false;
}

/** Read the tab payload (empty object on missing/garbled data). */
export function readTabPayload(e: DragEvent): TabPayload {
  try {
    return JSON.parse(e.dataTransfer?.getData(TAB_MIME) ?? "{}");
  } catch {
    return {};
  }
}

/** Write the tab payload + set `effectAllowed = "move"` (source strip only). */
export function writeTabPayload(e: DragEvent, payload: TabPayload): void {
  e.dataTransfer?.setData(TAB_MIME, JSON.stringify(payload));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}

// --- within-window drop handled flag ---------------------------------------
/**
 * A window-scoped flag set by any within-window tab drop handler when it
 * actually consumes a drop (`NoteTabs.onTabDrop`/`onStripDrop`,
 * `EditorPane.onEditorDrop`). The source strip's `dragend` reads + resets it to
 * decide whether the drag ended on a within-window target (reorder / move /
 * split — fully handled, so skip the cross-window `releaseTab` call) or landed
 * elsewhere (another window → move; outside every window → tear off).
 *
 * This is used INSTEAD OF `dataTransfer.dropEffect === "move"`: `dropEffect` is
 * sticky from the last `dragover` inside the source window, so it stays
 * `"move"` even when the cursor leaves the window over a drop zone — which
 * would falsely suppress the cross-window move. `drop` fires before `dragend`,
 * so the flag is set by the time `dragend` runs (and stays false for a
 * cross-window drop, where no within-window handler fires). Module-level → one
 * flag per renderer process (window); only one tab is dragged at a time.
 */
let tabDropHandled = false;

/** Mark that a within-window drop target consumed the in-flight tab drag. */
export function markTabDropHandled(): void {
  tabDropHandled = true;
}

/** Read + reset the flag (the source strip's `dragend` calls this once). */
export function consumeTabDropHandled(): boolean {
  const v = tabDropHandled;
  tabDropHandled = false;
  return v;
}

/** Reset the flag (the source strip clears it on `dragstart` to drop stale state). */
export function resetTabDropHandled(): void {
  tabDropHandled = false;
}

// --- drop zone (split-vs-move) ---------------------------------------------
/** A drag-to-split drop zone: an edge (split the pane that way) or the centre
 *  (move the tab into the pane, no split). */
export type DropZone = "left" | "right" | "top" | "bottom" | "center";

/** Edge-band thickness: the outer `DROP_MARGIN` fraction of each side is a
 *  directional zone; the central box is the "move into pane" zone. 0.3 → the
 *  centre is the middle 40%×40%, the surrounding frame splits per edge. */
export const DROP_MARGIN = 0.3;

/**
 * Resolve the drop zone for a point `(x, y)` (client/viewport coords) relative
 * to `rect`. Shared by the in-window `EditorPane` overlay and the cross-window
 * `app:open-note-at` handler so both split on the same edge thresholds.
 */
export function dropZoneFromPoint(x: number, y: number, rect: DOMRect): DropZone {
  if (rect.width === 0 || rect.height === 0) return "center";
  const dx = (x - rect.left) / rect.width;
  const dy = (y - rect.top) / rect.height;
  const left = dx;
  const right = 1 - dx;
  const top = dy;
  const bottom = 1 - dy;
  const min = Math.min(left, right, top, bottom);
  if (min > DROP_MARGIN) return "center";
  if (min === left) return "left";
  if (min === right) return "right";
  if (min === top) return "top";
  return "bottom";
}