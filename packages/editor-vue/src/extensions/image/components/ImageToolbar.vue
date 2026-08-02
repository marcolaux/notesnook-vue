<!--
  Part of the Notesnook Vue port (packages/editor-vue). Floating one-row
  toolbar shown above a selected image node. Combines alignment (left/center/
  right) with quick size presets (S/M/L/Full/Orig) — the discrete jumps + the
  alignment that the corner-drag resizer can't do. The drag handle itself stays
  the resize interaction (see Resizer.vue); this row only commits through the
  existing `setImageAlignment` / `setImageSize` commands, both of which
  re-select the node so the row stays visible after each click.

  Rendered inside ImageComponent's NodeViewWrapper (positioned absolutely above
  the frame, OUTSIDE the Resizer so it isn't clipped by `.image-frame`'s
  `overflow: hidden`). The NodeViewWrapper already tracks the image's position,
  so — unlike the table's cell toolbars — no teleport / scroll-listener
  repositioning is needed.
-->
<script setup lang="ts">
import { computed } from "vue";
import type { Editor } from "@tiptap/core";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Maximize2,
  RotateCcw
} from "@lucide/vue";

type Align = "left" | "center" | "right";
type NaturalSize = { width: number; height: number } | null;

const props = defineProps<{
  editor: Editor;
  align: Align;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  naturalSize: NaturalSize;
}>();

// Smallest size the Resizer allows (kept in sync with Resizer.vue's minWidth).
const MIN_WIDTH = 135;

const editorWidth = computed(
  () => props.editor.view.dom.clientWidth || 0
);

// Aspect ratio to use when deriving height from a target width. Prefer the
// stored `aspectRatio` attr (captured at ingest); fall back to the image's
// natural dimensions (captured on <img> load), then the current box dims.
const aspect = computed(() => {
  if (props.aspectRatio && props.aspectRatio > 0) return props.aspectRatio;
  const n = props.naturalSize;
  if (n && n.height) return n.width / n.height;
  if (props.width && props.height) return props.width / props.height;
  return 1;
});

function setAlign(a: Align): void {
  props.editor.commands.setImageAlignment({ align: a });
}

// Snap to a percentage of the editor content width; height derived from aspect.
function preset(pct: number): void {
  const max = editorWidth.value;
  if (max <= 0) return;
  let w = Math.round(max * pct);
  w = Math.max(MIN_WIDTH, Math.min(w, max));
  const h = Math.round(w / aspect.value);
  props.editor.commands.setImageSize({ width: w, height: h });
}

// Reset to the image's natural pixel size (capped to the editor width so it
// never overflows). If the image hasn't loaded yet (no natural size captured),
// fall back to the existing "clear size" idiom (auto).
function orig(): void {
  const n = props.naturalSize;
  const max = editorWidth.value;
  if (!n || !n.width || !n.height) {
    props.editor.commands.setImageSize({ width: null, height: null });
    return;
  }
  let w = n.width;
  if (max > 0 && w > max) w = max;
  const h = Math.round((w * n.height) / n.width);
  props.editor.commands.setImageSize({ width: w, height: h });
}
</script>

<template>
  <div
    class="image-toolbar"
    contenteditable="false"
    @pointerdown.stop.prevent
  >
    <div class="image-toolbar__group">
      <button
        type="button"
        class="img-tb-btn"
        :class="{ 'img-tb-btn--active': align === 'left' }"
        title="Align left"
        @click="setAlign('left')"
      >
        <AlignLeft :size="15" />
      </button>
      <button
        type="button"
        class="img-tb-btn"
        :class="{ 'img-tb-btn--active': align === 'center' }"
        title="Align center"
        @click="setAlign('center')"
      >
        <AlignCenter :size="15" />
      </button>
      <button
        type="button"
        class="img-tb-btn"
        :class="{ 'img-tb-btn--active': align === 'right' }"
        title="Align right"
        @click="setAlign('right')"
      >
        <AlignRight :size="15" />
      </button>
    </div>

    <span class="image-toolbar__sep" aria-hidden="true" />

    <div class="image-toolbar__group">
      <button type="button" class="img-tb-btn img-tb-btn--text" title="Small (25%)" @click="preset(0.25)">S</button>
      <button type="button" class="img-tb-btn img-tb-btn--text" title="Medium (50%)" @click="preset(0.5)">M</button>
      <button type="button" class="img-tb-btn img-tb-btn--text" title="Large (75%)" @click="preset(0.75)">L</button>
      <button type="button" class="img-tb-btn" title="Full width (100%)" @click="preset(1)">
        <Maximize2 :size="14" />
      </button>
      <button type="button" class="img-tb-btn" title="Original size" @click="orig">
        <RotateCcw :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.image-toolbar {
  position: absolute;
  left: 0;
  right: 0;
  /* Sits above the frame; the NodeViewWrapper is position: relative. */
  bottom: 100%;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--background) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--paragraph) 22%, transparent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  color: var(--text-muted, var(--paragraph));
  user-select: none;
  z-index: 5;
  /* Keep the row on one line; let it shrink rather than wrap. */
  flex-wrap: nowrap;
  width: max-content;
  max-width: 100%;
}
.image-toolbar__group {
  display: flex;
  align-items: center;
  gap: 2px;
}
.image-toolbar__sep {
  width: 1px;
  align-self: stretch;
  margin: 2px 2px;
  background: color-mix(in srgb, var(--paragraph) 22%, transparent);
}
.img-tb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  min-width: 24px;
  padding: 0 5px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: color-mix(in srgb, var(--paragraph) 80%, transparent);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}
.img-tb-btn--text {
  font-size: 11px;
}
.img-tb-btn:hover {
  background: color-mix(in srgb, var(--paragraph) 12%, transparent);
  color: var(--paragraph);
}
.img-tb-btn--active {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  color: var(--paragraph);
}
</style>