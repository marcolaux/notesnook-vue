/**
 * Resizable left-panel helpers (sidebar + notes list) — pure math so the
 * clamp/drag logic is unit-testable without a DOM. The actual pointer-capture
 * drag lives in `components/Resizer.vue`; this module just computes widths.
 *
 * Widths are persisted as JSON numbers under `notesnook.config.*` in the shell
 * store (mirroring `stores/config.ts`'s best-effort localStorage pattern).
 */

/** Sidebar width bounds + default (px). Default matches the old `w-60`. */
export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 480;
export const SIDEBAR_DEFAULT = 240;

/** Notes-list width bounds + default (px). Default matches the old `w-80`. */
export const LIST_MIN = 220;
export const LIST_MAX = 560;
export const LIST_DEFAULT = 320;

/** Clamp a width to `[min, max]`. NaN (a bad stored value) collapses to `min`. */
export function clampWidth(width: number, min: number, max: number): number {
  if (Number.isNaN(width)) return min;
  return Math.min(max, Math.max(min, width));
}

/** New width after a horizontal drag of `deltaX` px from `startWidth`. */
export function applyDrag(
  startWidth: number,
  deltaX: number,
  min: number,
  max: number
): number {
  return clampWidth(startWidth + deltaX, min, max);
}