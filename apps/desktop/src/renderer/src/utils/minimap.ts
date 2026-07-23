/**
 * Pure minimap geometry (Phase 5.2 — ToC/Minimap right sidebar).
 *
 * The minimap renders the note's content scaled down by a factor `scale` so it
 * fits the sidebar width, with a viewport "slider" rectangle marking the editor
 * region currently in view. These helpers compute the scale, the viewport
 * rectangle, and the scroll fraction implied by a pointer position — all pure
 * so they run in a node test environment and stay deterministic. The DOM
 * wiring (cloning the editor content, listening to scroll, dragging the
 * indicator) lives in `NoteMinimap.vue`; this module is the testable core.
 *
 * Convention: `scrollTop`, `viewportHeight` and `scrollHeight` describe the
 * editor's scroll container; the minimap mirrors those same quantities
 * multiplied by `scale`. A `minimapHeight` (the visible minimap area, usually
 * the editor viewport height) caps the indicator so it never overflows.
 */

/** Minimum scale floor — very wide content never shrinks below this or the
 *  minimap becomes an unreadable hairline. */
export const MINIMAP_SCALE_FLOOR = 0.04;

/** Clamp a number to `[lo, hi]`. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Compute the minimap scale: `minimapWidth / contentWidth`, floored at
 * {@link MINIMAP_SCALE_FLOOR} so absurdly wide content still renders a visible
 * strip. Returns the floor when `contentWidth` is zero/negative (nothing to
 * mirror yet).
 */
export function minimapScale(contentWidth: number, minimapWidth: number): number {
  if (contentWidth <= 0) return MINIMAP_SCALE_FLOOR;
  return Math.max(MINIMAP_SCALE_FLOOR, minimapWidth / contentWidth);
}

export interface ViewportRectInput {
  /** The editor scroll container's current `scrollTop` (px). */
  scrollTop: number;
  /** The editor scroll container's visible height (`clientHeight`, px). */
  viewportHeight: number;
  /** The editor scroll container's full scrollable height (`scrollHeight`, px). */
  scrollHeight: number;
  /** The minimap scale from {@link minimapScale}. */
  scale: number;
  /** The visible minimap area height (px) — caps the indicator. */
  minimapHeight: number;
  /** Minimum indicator height so a tiny viewport still shows a grabbable slider. */
  minHeight?: number;
}

export interface ViewportRect {
  /** Indicator top within the minimap (px). */
  top: number;
  /** Indicator height (px). */
  height: number;
}

/**
 * The viewport slider rectangle inside the minimap: `top = scrollTop * scale`,
 * `height = viewportHeight * scale`, clamped so the indicator stays within
 * `[0, minimapHeight]` and at least `minHeight` tall. When the content is
 * shorter than the viewport (no scrolling), the indicator covers the whole
 * minimap (`top = 0`, `height = minimapHeight`).
 */
export function viewportRect(input: ViewportRectInput): ViewportRect {
  const { scrollTop, viewportHeight, scrollHeight, scale, minimapHeight } = input;
  const minHeight = input.minHeight ?? 12;
  if (scrollHeight <= viewportHeight || minimapHeight <= 0) {
    return { top: 0, height: minimapHeight };
  }
  const rawHeight = viewportHeight * scale;
  const height = clamp(rawHeight, minHeight, minimapHeight);
  // The indicator's travel range so it never overflows the minimap bottom.
  const maxTop = minimapHeight - height;
  const maxScrollTop = scrollHeight - viewportHeight;
  const frac = maxScrollTop > 0 ? scrollTop / maxScrollTop : 0;
  const top = clamp(frac * maxTop, 0, maxTop);
  return { top, height };
}

/**
 * The scroll fraction implied by a pointer `y` inside the minimap during a
 * click/drag — VS-Code-style: the indicator is *centered* under the cursor, so
 * the fraction is `(y - indicatorHeight/2) / (minimapHeight - indicatorHeight)`,
 * clamped to `[0, 1]`. When the indicator fills the minimap (no room to travel),
 * returns `0` (no scroll possible).
 */
export function fractionFromPointerY(
  y: number,
  minimapHeight: number,
  indicatorHeight: number
): number {
  const travel = minimapHeight - indicatorHeight;
  if (travel <= 0) return 0;
  return clamp((y - indicatorHeight / 2) / travel, 0, 1);
}

/** Convert a scroll fraction (0..1) to the editor's `scrollTop` (px). Returns
 *  0 when the content does not overflow. */
export function scrollTopFromFraction(
  fraction: number,
  scrollHeight: number,
  viewportHeight: number
): number {
  const maxScrollTop = scrollHeight - viewportHeight;
  if (maxScrollTop <= 0) return 0;
  return clamp(fraction, 0, 1) * maxScrollTop;
}

/**
 * The `translateY` for the minimap's content layer so the viewport indicator
 * stays aligned with the editor's actual viewport (VS-Code-style). The editor
 * viewport top is at `scrollTop * scale` in content-minimap coordinates; the
 * indicator sits at `viewportRect(...).top` in the minimap viewport. We shift
 * the content so those two coincide, clamped so the content never scrolls past
 * its own bounds. Returns 0 (no shift) when the whole content fits the minimap.
 */
export function contentTranslateY(input: {
  scrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
  scale: number;
  minimapHeight: number;
}): number {
  const { scrollTop, viewportHeight, scrollHeight, scale, minimapHeight } = input;
  const contentH = scrollHeight * scale;
  if (contentH <= minimapHeight) return 0;
  const rect = viewportRect({ scrollTop, viewportHeight, scrollHeight, scale, minimapHeight });
  const maxTranslate = contentH - minimapHeight; // how far the content can move up
  return clamp(rect.top - scrollTop * scale, -maxTranslate, 0);
}