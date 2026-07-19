<script setup lang="ts">
/*
Image node-view — a lazily-loaded, resizable, alignable (block) image. Ported
from @notesnook/editor's React `ImageComponent` (extensions/image/component.tsx,
GPL-3.0); the React `createNodeView` layer is replaced by `NodeViewWrapper`
from @tiptap/vue-3.

The blob path is Phase-6-gated: when an image has a `hash` but no inline `src`,
the component asks `editor.storage.getAttachmentData({ type: "image", hash })`
for the encrypted attachment's data URL (only available once attachments auth /
login is wired in Phase 6) and turns it into a blob URL via `toBlobURL`. Until
then, images with an inline `src` (a data URL or an external URL) render
immediately without auth — so seeded and pasted-link images work today, and
the lazy-load is a no-op until Phase 6.

Scoped differences from upstream (this 2.4e increment):
  - No `useToolbarStore` (CORS-proxy `corsHost` lives in the toolbar store /
    settings, arriving with the toolbar in Phase 2.5). External image URLs load
    directly; `corsify` is still used (with no host) so the hook is in place.
  - No in-node toolbar (align-left/center/right + properties + preview +
    download) — that is the Phase 2.5 toolbar. `align` is still stored +
    round-tripped and applied via flex-justify; `setImageAlignment` remains
    available for the command palette / toolbar later.
  - No `onLoad` auto-aspect-ratio / size-fix and no external-URL download +
    re-embed-as-data-URL (needs `editor.threadsafe` + `updateAttachment`
    matching image nodes via the attachment `types` option). Deferred to
    Phase 6 / toolbar. Images render at their stored width/height (or 100%
    when unset); the resizer commits new sizes via `setImageSize`.
  - No SVG-as-`<iframe>` special case (needs the theme engine for the dark
    flag); SVGs render as a normal `<img>` (browsers render them fine).
  - No double-click preview (needs `editor.storage.previewAttachment`).
  - `textDirection`-derived alignment default is gone (text-direction extension
    not ported); an unset `align` falls back to "left" (same as the embed port).
  - IntersectionObserver root is the viewport (upstream uses `.ms-container`,
    the upstream editor scroll container, not present here). The observer
    target is the always-rendered frame (not the `<img>`) so it fires even
    before the blob loads and the img has a src.
*/
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/vue-3";
import Resizer from "../../components/Resizer.vue";
import { useObserver } from "../../utils/use-observer";
import { corsify, revokeBloburl, toBlobURL } from "../../utils/downloader";
import type { ImageAlignmentOptions } from "./types";

const props = defineProps<NodeViewProps>();

const src = computed(() => (props.node.attrs.src as string | null) ?? null);
const hash = computed(() => (props.node.attrs.hash as string | null) ?? null);
const mime = computed(() => (props.node.attrs.mime as string | null) ?? null);
const width = computed(() => (props.node.attrs.width as number | null) ?? null);
const height = computed(() => (props.node.attrs.height as number | null) ?? null);
const progress = computed(
  () => (props.node.attrs.progress as number | undefined) ?? 0
);
const align = computed<NonNullable<ImageAlignmentOptions["align"]>>(
  () => (props.node.attrs.align as ImageAlignmentOptions["align"]) ?? "left"
);
const isReadonly = computed(() => !props.editor.isEditable);

const bloburl = ref<string | undefined>(undefined);
const resizing = ref<{ width: number; height: number } | null>(null);

// The observer target is the always-rendered frame so intersection fires even
// before the blob loads (the `<img>` has no src until then).
const frameRef = ref<HTMLDivElement | null>(null);
const { inView } = useObserver<HTMLDivElement>(frameRef, {
  threshold: 0.2,
  once: true
});

const imgSrc = computed(
  () => bloburl.value || (src.value ? corsify(src.value, undefined) : undefined)
);

const justifyClass = computed(() =>
  align.value === "center"
    ? "justify-center"
    : align.value === "right"
      ? "justify-end"
      : "justify-start"
);

// Lazy blob fetch (Phase-6-gated): only when the image has a hash, no inline
// src, no blob yet, and the attachment-data bridge is wired. The `?.` chain
// keeps it a no-op until Phase 6 (the storage helpers are undefined then).
watch(
  () => inView.value,
  async (visible) => {
    if (!visible) return;
    if (src.value || !hash.value || bloburl.value) return;
    const getAttachmentData = (
      props.editor.storage as { getAttachmentData?: (p: unknown) => Promise<unknown> }
    ).getAttachmentData;
    if (typeof getAttachmentData !== "function") return;
    let data: unknown;
    try {
      data = await getAttachmentData({ type: "image", hash: hash.value });
    } catch {
      return;
    }
    if (typeof data !== "string" || !data) return;
    bloburl.value = toBlobURL(data, "image", mime.value ?? undefined, hash.value);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (hash.value) revokeBloburl(hash.value);
});

function onResize(w: number, h: number): void {
  resizing.value = { width: w, height: h };
}

function onResizeStop(w: number, h: number): void {
  resizing.value = null;
  // `setImageSize` updates the node attrs (history-tracked → undoable) and
  // re-selects the node so the resizer handle stays put after the drag.
  props.editor.commands.setImageSize({ width: w, height: h });
}
</script>

<template>
  <NodeViewWrapper as="div" class="image-node" :class="justifyClass">
    <Resizer
      :enabled="editor.isEditable"
      :selected="props.selected"
      :width="width"
      :height="height"
      :lock-aspect-ratio="true"
      @resize="onResize"
      @resize-stop="onResizeStop"
    >
      <div
        ref="frameRef"
        class="image-frame"
        :class="{ 'image-frame--selected': props.selected }"
      >
        <div
          v-if="editor.isEditable && props.selected"
          class="image-drag"
          data-drag-handle
          title="Drag to move"
        >
          ⠿
        </div>

        <div v-if="resizing" class="image-dim">{{ resizing.width }} × {{ resizing.height }}</div>

        <div v-if="progress" class="image-progress" aria-hidden="true">{{ progress }}%</div>

        <!-- placeholder overlay while we wait for the blob (hash, no src yet) -->
        <div v-if="!imgSrc && hash" class="image-placeholder">
          <svg viewBox="0 0 24 24" width="72" height="72" aria-hidden="true">
            <path
              fill="currentColor"
              d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
            />
          </svg>
        </div>

        <img
          v-if="imgSrc"
          class="image-img"
          :class="{ 'image-img--readonly': isReadonly }"
          :src="imgSrc"
          crossOrigin="anonymous"
          draggable="false"
        />
      </div>
    </Resizer>
  </NodeViewWrapper>
</template>

<style scoped>
.image-node {
  position: relative;
  display: flex;
  width: 100%;
}
.image-frame {
  position: relative;
  width: 100%;
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid transparent;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03);
}
.image-frame--selected {
  border-color: rgba(99, 102, 241, 0.65);
}
.image-img {
  display: block;
  max-width: 100%;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 4px;
}
.image-img--readonly {
  width: auto;
  height: auto;
}
.image-drag {
  position: absolute;
  top: -22px;
  right: 0;
  padding: 2px 6px;
  font-size: 14px;
  line-height: 1;
  color: rgba(160, 160, 180, 0.7);
  cursor: grab;
  user-select: none;
  z-index: 3;
}
.image-drag:active {
  cursor: grabbing;
}
.image-dim {
  position: absolute;
  top: -28px;
  left: 0;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(220, 220, 235, 0.9);
  background: rgba(40, 40, 55, 0.9);
  border-radius: 4px;
  z-index: 4;
  user-select: none;
}
.image-progress {
  position: absolute;
  bottom: 8px;
  right: 8px;
  padding: 2px 8px;
  font-size: 12px;
  color: rgba(220, 220, 235, 0.9);
  background: rgba(40, 40, 55, 0.85);
  border: 1px solid rgba(120, 120, 140, 0.4);
  border-radius: 999px;
  z-index: 2;
  user-select: none;
}
.image-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(140, 140, 160, 0.6);
}
</style>