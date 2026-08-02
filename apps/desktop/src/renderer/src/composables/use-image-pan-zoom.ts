/**
 * Pan + zoom for the image attachment preview (`AttachmentPreview.vue`).
 *
 * Applies a CSS `translate(x, y) scale(s)` (transform-origin: center) to the
 * `<img>`, which otherwise lays out fit-to-container via `object-contain`. The
 * fit size is read back from the element's own rect (divided by the current
 * scale) so clamping stays correct without tracking natural dimensions or
 * listening to container resize.
 *
 * Inputs:
 *  - trackpad pinch → Chromium synthesizes a `wheel` event with `ctrlKey`
 *    and a fractional `deltaY` (the gesture magnitude). We intercept it here
 *    (`preventDefault`) so Electron's built-in page-zoom (the `zoomIn`/`zoomOut`
 *    menu roles) doesn't fire while the cursor is over the image.
 *  - mouse wheel / trackpad two-finger scroll → pan (no `ctrlKey`).
 *  - pointer drag → pan (grab/grabbing cursor when zoomed).
 *  - two-finger touch → pinch (distance ratio) + pan (midpoint), for
 *    touchscreen laptops / tablets.
 *  - double-click → toggle between fit (scale 1) and 2×.
 *
 * Zoom is anchored at the cursor/midpoint: the content point under the pointer
 * stays fixed as the scale changes. Panning is clamped so a zoomed image can't
 * be dragged off-screen; when the image is smaller than the viewport at the
 * current scale it's held centered (no pan on that axis).
 *
 * Modelled on the viewport pattern in `VectorVisualizerModal.vue` (canvas),
 * but adapted for a DOM `<img>` and with cursor-anchored zoom + bounds clamp.
 */
import { computed, onUnmounted, ref, watch, type Ref } from "vue";

export interface PanZoomViewport {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.25;

export function useImagePanZoom(opts: {
  container: Ref<HTMLElement | null>;
  img: Ref<HTMLImageElement | null>;
  /** When false, all interaction is suppressed (e.g. image not yet loaded). */
  enabled?: Ref<boolean>;
}) {
  const enabled = opts.enabled ?? ref(true);
  const viewport = ref<PanZoomViewport>({ x: 0, y: 0, scale: 1 });
  const dragging = ref(false);

  const transformStyle = computed(() => ({
    transform: `translate(${viewport.value.x}px, ${viewport.value.y}px) scale(${viewport.value.scale})`,
    transformOrigin: "center center",
    willChange: "transform"
  }));

  const isZoomed = computed(
    () =>
      viewport.value.scale > 1.0001 ||
      Math.abs(viewport.value.x) > 0.5 ||
      Math.abs(viewport.value.y) > 0.5
  );
  const zoomPercent = computed(() => Math.round(viewport.value.scale * 100));

  // Fit (scale-1) size of the image inside the container, back-derived from the
  // element's current rendered rect (which already reflects the transform).
  function fitSize(): { fw: number; fh: number } | null {
    const img = opts.img.value;
    const s = viewport.value.scale;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || s === 0) return null;
    return { fw: r.width / s, fh: r.height / s };
  }

  function clampScale(s: number): number {
    return Math.min(Math.max(s, MIN_SCALE), MAX_SCALE);
  }

  // Keep the image covering the viewport when zoomed in; center it on an axis
  // where it's smaller than the viewport at this scale.
  function clampPos(
    x: number,
    y: number,
    s: number,
    fw: number,
    fh: number
  ): { x: number; y: number } {
    const c = opts.container.value;
    if (!c) return { x, y };
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    const dw = fw * s;
    const dh = fh * s;
    let nx = x;
    let ny = y;
    if (dw <= cw) nx = 0;
    else nx = Math.min(Math.max(x, -(dw - cw) / 2), (dw - cw) / 2);
    if (dh <= ch) ny = 0;
    else ny = Math.min(Math.max(y, -(dh - ch) / 2), (dh - ch) / 2);
    return { x: nx, y: ny };
  }

  /** Zoom by `factor` keeping the content under (clientX, clientY) fixed. */
  function zoomAt(clientX: number, clientY: number, factor: number): void {
    if (!enabled.value) return;
    const c = opts.container.value;
    if (!c) return;
    const fit = fitSize();
    if (!fit) return;
    const cRect = c.getBoundingClientRect();
    // Cursor in container-local coords.
    const px = clientX - cRect.left;
    const py = clientY - cRect.top;
    // Container center (the transform-origin) in container-local coords.
    const ccx = c.clientWidth / 2;
    const ccy = c.clientHeight / 2;
    const oldS = viewport.value.scale;
    const newS = clampScale(oldS * factor);
    if (newS === oldS) return;
    // Content offset from image center under the cursor (in fit px) stays fixed:
    //   (px - ccx - x) / oldS == (px - ccx - xNew) / newS
    const ox = px - ccx - viewport.value.x;
    const oy = py - ccy - viewport.value.y;
    let nx = px - ccx - (ox / oldS) * newS;
    let ny = py - ccy - (oy / oldS) * newS;
    const clamped = clampPos(nx, ny, newS, fit.fw, fit.fh);
    viewport.value = { x: clamped.x, y: clamped.y, scale: newS };
  }

  function panBy(dx: number, dy: number): void {
    if (!enabled.value) return;
    const fit = fitSize();
    if (!fit) return;
    const nx = viewport.value.x + dx;
    const ny = viewport.value.y + dy;
    const clamped = clampPos(nx, ny, viewport.value.scale, fit.fw, fit.fh);
    viewport.value = { ...viewport.value, x: clamped.x, y: clamped.y };
  }

  function onWheel(e: WheelEvent): void {
    if (!enabled.value) return;
    e.preventDefault();
    if (e.ctrlKey) {
      // Trackpad pinch (Chromium synthesizes ctrl+wheel). `deltaY` is the
      // gesture magnitude (fractional); invert sign so pinch-out (negative
      // deltaY) zooms in.
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      zoomAt(e.clientX, e.clientY, factor);
    } else {
      // Mouse wheel / trackpad scroll → pan. Shift swaps to horizontal.
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      const dy = e.shiftKey ? 0 : e.deltaY;
      panBy(-dx, -dy);
    }
  }

  // --- Pointer drag pan ---------------------------------------------------
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  let dragStartX = 0;
  let dragStartY = 0;

  function onPointerDown(e: PointerEvent): void {
    if (!enabled.value) return;
    // Only pan with the primary button; let through otherwise.
    if (e.button !== 0) return;
    // Touch is handled by the touch handlers below (1-finger pan + 2-finger
    // pinch) to avoid pointer/touch gesture conflicts.
    if (e.pointerType === "touch") return;
    dragging.value = true;
    dragStartClientX = e.clientX;
    dragStartClientY = e.clientY;
    dragStartX = viewport.value.x;
    dragStartY = viewport.value.y;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!dragging.value) return;
    const dx = e.clientX - dragStartClientX;
    const dy = e.clientY - dragStartClientY;
    const fit = fitSize();
    if (!fit) return;
    const nx = dragStartX + dx;
    const ny = dragStartY + dy;
    const clamped = clampPos(nx, ny, viewport.value.scale, fit.fw, fit.fh);
    viewport.value = { ...viewport.value, x: clamped.x, y: clamped.y };
  }

  function onPointerUp(e: PointerEvent): void {
    if (!dragging.value) return;
    dragging.value = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }

  // --- Touch: 1-finger pan + 2-finger pinch ------------------------------
  let touchDist = 0;
  let touchMidX = 0;
  let touchMidY = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;
  let pinching = false;

  function touchDistance(t1: Touch, t2: Touch): number {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  }

  function onTouchStart(e: TouchEvent): void {
    if (!enabled.value) return;
    if (e.touches.length === 2) {
      pinching = true;
      const [t1, t2] = [e.touches[0]!, e.touches[1]!];
      touchDist = touchDistance(t1, t2);
      touchMidX = (t1.clientX + t2.clientX) / 2;
      touchMidY = (t1.clientY + t2.clientY) / 2;
    } else if (e.touches.length === 1) {
      pinching = false;
      lastTouchX = e.touches[0]!.clientX;
      lastTouchY = e.touches[0]!.clientY;
    }
  }

  function onTouchMove(e: TouchEvent): void {
    if (!enabled.value) return;
    if (pinching && e.touches.length === 2) {
      e.preventDefault();
      const [t1, t2] = [e.touches[0]!, e.touches[1]!];
      const dist = touchDistance(t1, t2);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      if (touchDist > 0) {
        // Anchor the pinch at the midpoint; each move is a relative zoom from
        // the last frame so the gesture tracks the fingers.
        zoomAt(midX, midY, dist / touchDist);
      }
      // Pan by the midpoint delta (in addition to the re-anchored zoom).
      panBy(midX - touchMidX, midY - touchMidY);
      touchDist = dist;
      touchMidX = midX;
      touchMidY = midY;
    } else if (!pinching && e.touches.length === 1) {
      e.preventDefault();
      const t = e.touches[0]!;
      panBy(t.clientX - lastTouchX, t.clientY - lastTouchY);
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
    }
  }

  function onTouchEnd(e: TouchEvent): void {
    if (e.touches.length === 0) {
      pinching = false;
    } else if (e.touches.length === 1) {
      // One finger lifted mid-pinch → resume single-finger pan from here.
      pinching = false;
      lastTouchX = e.touches[0]!.clientX;
      lastTouchY = e.touches[0]!.clientY;
    }
  }

  // --- Button / programmatic controls ------------------------------------
  function zoomIn(): void {
    const c = opts.container.value;
    if (!c) return;
    const r = c.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, ZOOM_STEP);
  }

  function zoomOut(): void {
    const c = opts.container.value;
    if (!c) return;
    const r = c.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / ZOOM_STEP);
  }

  function reset(): void {
    viewport.value = { x: 0, y: 0, scale: 1 };
  }

  function toggleZoom(): void {
    if (isZoomed.value) reset();
    else {
      const c = opts.container.value;
      if (!c) return;
      const r = c.getBoundingClientRect();
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, 2);
    }
  }

  // Reset when the enabled ref flips back on (new image loaded after a hash
  // change) so a reused/cached preview doesn't inherit the previous zoom.
  if (opts.enabled) {
    watch(enabled, (on) => {
      if (on) reset();
    });
  }

  onUnmounted(() => {
    dragging.value = false;
    pinching = false;
  });

  return {
    viewport,
    dragging,
    transformStyle,
    isZoomed,
    zoomPercent,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    zoomIn,
    zoomOut,
    reset,
    toggleZoom
  };
}