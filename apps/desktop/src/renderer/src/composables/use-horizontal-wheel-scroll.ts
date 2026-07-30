import { onBeforeUnmount, onMounted, type Ref } from "vue";

/**
 * Translate a vertical mouse-wheel spin into horizontal scroll on a
 * horizontally-scrollable element (`overflow-x-auto`). Trackpads emit `deltaX`
 * for native horizontal panning, so the `deltaY`→`scrollLeft` remap only kicks
 * in when there is no horizontal component.
 *
 * `preventDefault` is called ONLY when the strip actually moved — so at the
 * left/right edges (or when the content fits and there is nothing to scroll)
 * the wheel bubbles normally and the page/parent keeps scrolling. The listener
 * is attached non-passive (`{ passive: false }`) to permit that.
 *
 * @param el template ref to the `overflow-x-auto` scroll container.
 */
export function useHorizontalWheelScroll(el: Ref<HTMLElement | null>): void {
  function onWheel(e: WheelEvent): void {
    const target = el.value;
    if (!target) return;
    // Nothing to scroll horizontally — let the event bubble (page scroll).
    if (target.scrollWidth <= target.clientWidth) return;
    const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
    if (delta === 0) return;
    const before = target.scrollLeft;
    target.scrollLeft += delta;
    // Suppress the default only when we actually consumed the wheel, so the
    // page/parent keeps scrolling at the strip's edges.
    if (target.scrollLeft !== before) e.preventDefault();
  }

  onMounted(() => el.value?.addEventListener("wheel", onWheel, { passive: false }));
  onBeforeUnmount(() => el.value?.removeEventListener("wheel", onWheel));
}