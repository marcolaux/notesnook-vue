/**
 * Tab tear-off predicate (multi-window). Pure + shared so it is contract-
 * testable and the main process doesn't get pulled into renderer tests.
 *
 * When a tab is dragged, HTML5 drag-and-drop fires `dragend` once the user
 * releases. We tear the tab off into a new window iff the pointer ended up
 * *outside* the source window's outer screen rect AND it actually moved
 * (so a click-without-drag, or an Esc-cancel — which reports the start
 * position / (0,0) — never tears off).
 */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** True when the screen-space point (x, y) lies outside `rect`. */
export function isPointOutsideRect(x: number, y: number, rect: ScreenRect): boolean {
  return x < rect.left || x > rect.left + rect.width || y < rect.top || y > rect.top + rect.height;
}

/** True when the screen-space point (x, y) lies inside `rect` (inclusive). */
export function isPointInsideRect(x: number, y: number, rect: ScreenRect): boolean {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

/**
 * A live app window for {@link resolveTabRelease}: its webContents `id` (the key
 * main uses to address IPC), its OS screen rect, and whether it's the singleton
 * Settings window (Settings is never a tab-move target — it has no editor).
 */
export interface WindowRect {
  id: number;
  rect: ScreenRect;
  isSettings: boolean;
}

/** What the main process should do when a tab drag is released. */
export type TabReleaseAction = "none" | "moved" | "toreOff";

export interface TabReleaseResult {
  action: TabReleaseAction;
  /** The destination window's webContents id when `action === "moved"`. */
  targetId?: number;
}

/**
 * Decide what a tab drag that started at `(startX, startY)` and ended at
 * `(endX, endY)` — all in OS screen coordinates — should do at release:
 *
 *  - `"none"` — the drag ended back inside the source window (a within-window
 *    reorder/move/split handled by the renderer's own drop, which already set
 *    `dropEffect = "move"`); do nothing.
 *  - `"moved"` — the drag ended over a DIFFERENT app window (not Settings):
 *    move the tab there (main forwards `app:open-note` to that window + the
 *    source closes its tab).
 *  - `"toreOff"` — the drag ended outside every window: tear the tab off into a
 *    new note window (the legacy tear-off).
 *
 * HTML5 `dataTransfer` does not cross Electron windows, so a drop on another
 * window's tab bar / drop zone is invisible to it — the move is routed through
 * the main process from the source's `dragend`, which reads the live cursor and
 * matches it against every window's OS bounds.
 *
 * Pure + shared so it is contract-testable; the main process composes it with
 * the live `BrowserWindow` list.
 */
export function resolveTabRelease(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  windows: WindowRect[]
): TabReleaseResult {
  const source = windows.find((w) => isPointInsideRect(startX, startY, w.rect));
  // No source window for the dragstart point (shouldn't happen — dragstart is
  // captured while the cursor is inside the source window) → nothing to do.
  if (!source) return { action: "none" };
  // Ended back inside the source window → the renderer already handled it as a
  // within-window drop (and set `dropEffect = "move"`, so `dragend` would have
  // returned early before calling us). Treat as "none" defensively.
  if (isPointInsideRect(endX, endY, source.rect)) return { action: "none" };
  // Ended over another non-Settings app window → move the tab there.
  const target = windows.find(
    (w) => w.id !== source.id && !w.isSettings && isPointInsideRect(endX, endY, w.rect)
  );
  if (target) return { action: "moved", targetId: target.id };
  // Ended outside every window → tear off into a new note window.
  return { action: "toreOff" };
}

/**
 * Decide whether a tab drag that started at (startX, startY) and ended at
 * (endX, endY) — all in screen coordinates — should tear off into a new
 * window. Requires movement beyond `minDrag` px (Manhattan distance) AND the
 * end point to be outside the source window's outer screen rect.
 */
export function shouldTearOffTab(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  rect: ScreenRect,
  minDrag = 4
): boolean {
  const moved = Math.abs(endX - startX) + Math.abs(endY - startY) > minDrag;
  return moved && isPointOutsideRect(endX, endY, rect);
}