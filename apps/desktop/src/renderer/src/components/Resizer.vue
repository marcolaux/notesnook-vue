<script setup lang="ts">
/**
 * A thin vertical drag handle for resizing a left panel (sidebar / notes list).
 * Presentational + store-free: the parent owns the persisted width and passes
 * it back in via `:width`; this component only emits `resize` with the new
 * width as the user drags. Mirrors the pointer-capture sash in `SplitLayout.vue`
 * but operates in absolute px against the panel's width (not flex ratios).
 *
 * The drag math (`applyDrag`) lives in `utils/resizer.ts` so it is unit-tested
 * without a DOM; this component is just the pointer-event wiring.
 */
import { ref } from "vue";
import { applyDrag } from "@/utils/resizer";

const props = defineProps<{
  /** Current panel width (px) — the parent's source of truth. */
  width: number;
  min: number;
  max: number;
}>();

const emit = defineEmits<{
  (e: "resize", width: number): void;
  /** Fired on pointerdown so the owning panel can suppress its width
   *  transition during the drag (otherwise each pointermove animates over the
   *  transition duration and the drag feels laggy). */
  (e: "resize-start"): void;
  (e: "resize-end"): void;
}>();

let startX = 0;
let startWidth = 0;
const dragging = ref(false);

function onPointerDown(e: PointerEvent): void {
  e.preventDefault();
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  startX = e.clientX;
  startWidth = props.width;
  dragging.value = true;
  emit("resize-start");
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging.value) return;
  emit("resize", applyDrag(startWidth, e.clientX - startX, props.min, props.max));
}

function onPointerUp(e: PointerEvent): void {
  if (!dragging.value) return;
  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  dragging.value = false;
  emit("resize-end");
}
</script>

<template>
  <!--
    Wider-than-visible hit area (7px) so the sash is easy to grab, kept fully
    transparent so it's invisible: it overlaps the panel to its left (via
    `margin-left: -7px`), so the transparent zone shows the panel's glass
    beneath — not the bright window material that a gap would reveal. The
    visible divider is just the 1px `bg-glass-border` line pinned to the right
    edge of the zone (the actual panel boundary). The panel's rightmost 7px is
    covered by this handle (its pointer events come here, not the panel).
  -->
  <div
    class="group relative shrink-0 cursor-col-resize"
    style="width: 7px; margin-left: -7px; touch-action: none"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  >
    <div
      class="pointer-events-none absolute inset-y-0 right-0 w-px bg-glass-border transition-colors group-hover:bg-accent"
      :class="dragging ? 'bg-accent' : ''"
    />
  </div>
</template>