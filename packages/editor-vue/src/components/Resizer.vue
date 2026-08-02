<script setup lang="ts">
/*
A minimal Vue port of @notesnook/editor's React `Resizer`
(components/resizer/index.tsx, GPL-3.0), which wraps `re-resizable`.

Upstream enables a single bottom-right drag handle (only while the node is
selected) and reports the live `clientWidth`/`clientHeight` of the resized
element via `onResize`. This port reproduces that contract with a hand-rolled
pointer-based handle — no new runtime dependency (the roadmap's
`vue3-draggable-resizable` is only needed if we later want multi-handle / edge
resizing; embed + image only use the bottom-right corner).

Scoped differences from upstream:
  - No `bounds`-clamping to the editor DOM (upstream clamps to `getEditorDOM()`);
    we clamp to `minWidth` and `maxWidth: 100%` of the parent instead, which is
    sufficient for a single corner handle and avoids reaching into the editor
    shell from the editor-vue package.
  - `onResizeStop` is accepted but the resize is committed live via `onResize`
    (embed/image call `setEmbedSize`/`setImageSize` on every move), so the stop
    callback is a no-op hook kept for API parity.
  - The handle is a Lucide `Scaling` glyph (the codebase's standard icon set),
    themed with currentColor so it inherits the surrounding text color.
*/
import { computed, ref } from "vue";
import { Scaling } from "@lucide/vue";

const props = withDefaults(
  defineProps<{
    enabled?: boolean;
    selected?: boolean;
    width?: number | null;
    height?: number | null;
    lockAspectRatio?: boolean;
    minWidth?: number;
  }>(),
  {
    enabled: true,
    selected: false,
    width: null,
    height: null,
    lockAspectRatio: true,
    minWidth: 135
  }
);

const emit = defineEmits<{
  (e: "resize", width: number, height: number): void;
  (e: "resizeStop", width: number, height: number): void;
}>();

// The wrapper whose size we measure + mutate during a drag.
const wrapper = ref<HTMLElement | null>(null);
const dragging = ref(false);

// When an explicit size is committed (after a drag) AND the aspect ratio is
// locked (image, NOT embed), drive the box height from `aspect-ratio` instead
// of a fixed px height. The wrapper's `max-width: 100%` clamps only the width
// when the editor narrows below the stored `width`; with a fixed px height the
// frame keeps its height and the image letterboxes inside it (the "height
// stays the same when the editor resizes" symptom). With `aspect-ratio`, a
// clamped width yields a proportionally-scaled height, preserving the shape.
// Embed passes `lockAspectRatio: false` and keeps its fixed px height (an
// iframe's height is independent of its width, like a fixed player height).
const sizeStyle = computed(() => {
  const w = props.width;
  const h = props.height;
  if (w && h) {
    return props.lockAspectRatio
      ? { width: `${w}px`, aspectRatio: `${w} / ${h}` }
      : { width: `${w}px`, height: `${h}px` };
  }
  return {
    width: w ? `${w}px` : "auto",
    height: h ? `${h}px` : "auto"
  };
});

let startX = 0;
let startY = 0;
let startW = 0;
let startH = 0;
let aspect = 1;

function onPointerDown(e: PointerEvent): void {
  if (!props.enabled || !props.selected) return;
  e.preventDefault();
  const el = wrapper.value;
  if (!el) return;
  dragging.value = true;
  startX = e.clientX;
  startY = e.clientY;
  startW = el.clientWidth;
  startH = el.clientHeight;
  aspect = startW > 0 && startH > 0 ? startW / startH : 1;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging.value) return;
  let w = startW + (e.clientX - startX);
  let h = startH + (e.clientY - startY);
  // clamp width to [minWidth, parent width]; height is free.
  const parent = wrapper.value?.parentElement;
  const maxW = parent ? parent.clientWidth : Infinity;
  if (w > maxW) w = maxW;
  if (w < props.minWidth) w = props.minWidth;
  if (props.lockAspectRatio) h = Math.round(w / aspect);
  if (w < 1) w = 1;
  if (h < 1) h = 1;
  emit("resize", w, h);
}

function onPointerUp(e: PointerEvent): void {
  if (!dragging.value) return;
  dragging.value = false;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  const el = wrapper.value;
  if (el) {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore — pointer already released
    }
    emit("resizeStop", el.clientWidth, el.clientHeight);
  }
}
</script>

<template>
  <div v-if="!enabled" class="resizer-static" :style="sizeStyle">
    <slot />
  </div>
  <div
    v-else
    ref="wrapper"
    class="resizer"
    :class="{ 'resizer--selected': selected, 'resizer--dragging': dragging }"
    :style="sizeStyle"
  >
    <slot />
    <div
      v-if="selected"
      class="resizer__handle"
      @pointerdown.stop="onPointerDown"
    >
      <Scaling :size="16" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.resizer,
.resizer-static {
  position: relative;
  max-width: 100%;
}
.resizer__handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  cursor: nwse-resize;
  color: color-mix(in srgb, var(--paragraph) 85%, transparent);
  z-index: 2;
  user-select: none;
}
.resizer__handle:hover {
  color: var(--accent);
}
.resizer--selected {
  outline: 2px solid color-mix(in srgb, var(--accent) 65%, transparent);
  outline-offset: 0;
}
</style>