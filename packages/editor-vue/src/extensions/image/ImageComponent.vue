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
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/vue-3";
import { Image as ImageIcon } from "@lucide/vue";
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
//
// Self-healing with retry. The IntersectionObserver is `once`, so a single
// missed attempt would otherwise leave the image on the placeholder
// permanently — the "first click shows a placeholder, switching notes fixes
// it" symptom. Two failure modes are covered:
//  - `getAttachmentData` not wired yet (the editor watch that installs it can
//    flush after this node-view mounts) → retry on `nextTick`.
//  - `getAttachmentData` wired but the read returns empty / throws (the
//    attachment data can be momentarily unavailable on the first note open
//    after launch) → retry with a short backoff. A full Editor remount (note
//    switch) is what currently recovers this; the backoff mirrors that without
//    requiring the user to switch notes.
// `editor.storage` is a plain (non-reactive) object, so we poll rather than
// watch it. `cancelled` aborts the retry chain when the node-view unmounts.
let attachmentLoadAttempts = 0;
let cancelled = false;
const MAX_ATTACHMENT_ATTEMPTS = 8;
// Subscription to the host's "attachment downloaded" event (wired by
// `wireAttachmentStorage` in the renderer). When a blob queued by
// `db.attachments.downloadMedia(noteId)` lands, the host fires
// `EVENTS.mediaAttachmentDownloaded` with the hash; if it matches this image
// we reset the retry counter and re-fetch — the local file now exists, so
// `getAttachmentData` succeeds. Without this, a slow network download can
// outlast the 8×150ms retry window and leave the image on the placeholder
// until a note switch forces a remount. No-op when the hook isn't wired
// (pure-editor test setups).
let unsubscribeDownload: (() => void) | undefined;
async function loadAttachmentBlob(): Promise<void> {
  if (cancelled || src.value || !hash.value || bloburl.value) return;
  const getAttachmentData = (
    props.editor.storage as { getAttachmentData?: (p: unknown) => Promise<unknown> }
  ).getAttachmentData;
  if (typeof getAttachmentData !== "function") {
    if (attachmentLoadAttempts === 0) {
      // eslint-disable-next-line no-console
      console.debug("[image] loadAttachmentBlob: getAttachmentData not wired yet", hash.value);
    }
    if (attachmentLoadAttempts++ < MAX_ATTACHMENT_ATTEMPTS) {
      await nextTick().then(loadAttachmentBlob);
    } else {
      // eslint-disable-next-line no-console
      console.warn("[image] gave up: getAttachmentData never wired for hash", hash.value);
    }
    return;
  }
  let data: unknown;
  try {
    data = await getAttachmentData({ type: "image", hash: hash.value });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[image] getAttachmentData threw for hash", hash.value, e);
    data = undefined;
  }
  if (cancelled) return;
  if (typeof data !== "string" || !data) {
    if (attachmentLoadAttempts++ < MAX_ATTACHMENT_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 150));
      return loadAttachmentBlob();
    }
    // eslint-disable-next-line no-console
    console.warn("[image] gave up: no attachment data for hash", hash.value);
    return;
  }
  attachmentLoadAttempts = 0;
  bloburl.value = toBlobURL(data, "image", mime.value ?? undefined, hash.value);
}

watch(
  () => inView.value,
  (visible) => {
    // eslint-disable-next-line no-console
    console.log("[image-obs] inView changed", visible, "hash=", hash.value);
    if (!visible) return;
    void loadAttachmentBlob();
  },
  { immediate: true }
);

// Safety net for the first editor mount after app launch: the viewport-rooted
// IntersectionObserver can fail to report a visible image as intersecting on
// that first mount (the `once` observer then never retries, leaving a visible
// image on the placeholder permanently — the "first click shows a placeholder,
// switching notes fixes it" symptom; a fresh Editor remount on note switch is
// what currently recovers it). After a short delay, if the blob still hasn't
// loaded and the frame is actually within the viewport (verified directly via
// getBoundingClientRect, not trusting the observer), load it directly. This
// preserves lazy-loading for genuinely off-screen images (rect outside the
// viewport → skip) while recovering the observer's first-mount miss.
onMounted(() => {
  // Subscribe to the host's "attachment downloaded" event so a blob that lands
  // after our retry window re-triggers a load. Only when a hash is present
  // (hash-less inline-src images never need it).
  if (hash.value) {
    const subscribe = (
      props.editor.storage as {
        subscribeAttachmentDownloaded?: (
          handler: (payload: { hash: string; src?: string }) => void
        ) => { unsubscribe: () => void } | undefined;
      }
    ).subscribeAttachmentDownloaded;
    const sub = subscribe?.((payload) => {
      if (cancelled || bloburl.value || src.value) return;
      if (payload?.hash !== hash.value) return;
      attachmentLoadAttempts = 0;
      void loadAttachmentBlob();
    });
    unsubscribeDownload = sub?.unsubscribe;
  }
  setTimeout(() => {
    if (cancelled || bloburl.value || src.value || !hash.value) return;
    if (inView.value) return; // observer already drove a load
    const el = frameRef.value;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const inViewport =
      r.top < window.innerHeight &&
      r.bottom > 0 &&
      r.left < window.innerWidth &&
      r.right > 0;
    if (inViewport) {
      // eslint-disable-next-line no-console
      console.log(
        "[image-obs] safety-net load (observer missed on first mount), inView=",
        inView.value,
        "hash=",
        hash.value
      );
      void loadAttachmentBlob();
    }
  }, 250);
});

onBeforeUnmount(() => {
  cancelled = true;
  unsubscribeDownload?.();
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
        :class="{
          'image-frame--selected': props.selected,
          'image-frame--placeholder': !imgSrc && hash
        }"
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
          <ImageIcon :size="72" aria-hidden="true" />
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
  /* Fill the Resizer wrapper so the frame inherits its aspect-ratio-derived
     height (the wrapper clamps width via max-width:100% when the editor
     narrows; aspect-ratio then scales the height proportionally). */
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid transparent;
  border-radius: 6px;
  overflow: hidden;
  background: color-mix(in srgb, var(--paragraph) 3%, transparent);
}
/* Only the placeholder state needs a min-height (no <img> to size the box yet).
   A blanket min-height would force a small resized image (aspect-height < 80px)
   tall and re-break the aspect ratio the Resizer preserves. */
.image-frame--placeholder {
  min-height: 80px;
}
.image-frame--selected {
  border-color: color-mix(in srgb, var(--accent) 65%, transparent);
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
  color: color-mix(in srgb, var(--paragraph) 70%, transparent);
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
  color: var(--paragraph);
  background: color-mix(in srgb, var(--background) 90%, transparent);
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
  color: var(--paragraph);
  background: color-mix(in srgb, var(--background) 85%, transparent);
  border: 1px solid color-mix(in srgb, var(--paragraph) 40%, transparent);
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
  color: color-mix(in srgb, var(--paragraph) 60%, transparent);
}
</style>