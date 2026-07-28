<script setup lang="ts">
/*
Audio node-view — a styled inline-playable `<audio controls>` player for audio
attachments. Modelled on ImageComponent.vue (the image node-view): the blob is
lazy-loaded from the encrypted attachment via
`editor.storage.getAttachmentData({ hash })` (the hook `wireAttachmentStorage`
in attachments-bridge.ts installs — generic by hash, so it works for audio
without new storage wiring). Until the blob lands, a placeholder audio icon is
shown.

Scoped differences from the image node-view:
  - No `Resizer` (audio has no intrinsic dimensions worth preserving; the
    player is a fixed-height bar). `setAudioSize` remains available for future
    toolbar use.
  - `<audio controls>` is the player; the frame only provides the design
    pattern (border/radius/surface) and selection highlight.
  - IntersectionObserver + retry + `subscribeAttachmentDownloaded` self-healing
    are reused verbatim from the image node-view so the same first-mount /
    slow-network recovery applies.
*/
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/vue-3";
import { FileAudio } from "@lucide/vue";
import { useObserver } from "../../utils/use-observer";
import { toBlobURL, revokeBloburl } from "../../utils/downloader";
import type { AudioAlignmentOptions } from "./types";

const props = defineProps<NodeViewProps>();

const src = computed(() => (props.node.attrs.src as string | null) ?? null);
const hash = computed(() => (props.node.attrs.hash as string | null) ?? null);
const mime = computed(() => (props.node.attrs.mime as string | null) ?? null);
const progress = computed(
  () => (props.node.attrs.progress as number | undefined) ?? 0
);
const align = computed<NonNullable<AudioAlignmentOptions["align"]>>(
  () => (props.node.attrs.align as AudioAlignmentOptions["align"]) ?? "left"
);

const bloburl = ref<string | undefined>(undefined);

const frameRef = ref<HTMLDivElement | null>(null);
const { inView } = useObserver<HTMLDivElement>(frameRef, {
  threshold: 0.2,
  once: true
});

const audioSrc = computed(() => bloburl.value || src.value || undefined);

const justifyClass = computed(() =>
  align.value === "center"
    ? "justify-center"
    : align.value === "right"
      ? "justify-end"
      : "justify-start"
);

// Lazy blob fetch — same self-healing retry as the image node-view. The
// IntersectionObserver is `once`, so a missed attempt would leave the player
// on the placeholder permanently; the retry + download-subscription recover it.
let attachmentLoadAttempts = 0;
let cancelled = false;
const MAX_ATTACHMENT_ATTEMPTS = 8;
let unsubscribeDownload: (() => void) | undefined;
async function loadAttachmentBlob(): Promise<void> {
  if (cancelled || src.value || !hash.value || bloburl.value) return;
  const getAttachmentData = (
    props.editor.storage as { getAttachmentData?: (p: unknown) => Promise<unknown> }
  ).getAttachmentData;
  if (typeof getAttachmentData !== "function") {
    if (attachmentLoadAttempts++ < MAX_ATTACHMENT_ATTEMPTS) {
      await nextTick().then(loadAttachmentBlob);
    }
    return;
  }
  let data: unknown;
  try {
    data = await getAttachmentData({ type: "audio", hash: hash.value });
  } catch {
    data = undefined;
  }
  if (cancelled) return;
  if (typeof data !== "string" || !data) {
    if (attachmentLoadAttempts++ < MAX_ATTACHMENT_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 150));
      return loadAttachmentBlob();
    }
    return;
  }
  attachmentLoadAttempts = 0;
  bloburl.value = toBlobURL(data, "other", mime.value ?? undefined, hash.value);
}

watch(
  () => inView.value,
  (visible) => {
    if (!visible) return;
    void loadAttachmentBlob();
  },
  { immediate: true }
);

onMounted(() => {
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
  // Safety net for the first editor mount (the viewport-rooted observer can
  // miss a visible node on first mount); load directly if actually in viewport.
  setTimeout(() => {
    if (cancelled || bloburl.value || src.value || !hash.value) return;
    if (inView.value) return;
    const el = frameRef.value;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const inViewport =
      r.top < window.innerHeight &&
      r.bottom > 0 &&
      r.left < window.innerWidth &&
      r.right > 0;
    if (inViewport) void loadAttachmentBlob();
  }, 250);
});

onBeforeUnmount(() => {
  cancelled = true;
  unsubscribeDownload?.();
  if (hash.value) revokeBloburl(hash.value);
});
</script>

<template>
  <NodeViewWrapper as="div" class="audio-node" :class="justifyClass">
    <div
      ref="frameRef"
      class="audio-frame"
      :class="{
        'audio-frame--selected': props.selected,
        'audio-frame--placeholder': !audioSrc && hash
      }"
    >
      <div v-if="progress" class="audio-progress" aria-hidden="true">{{ progress }}%</div>

      <div v-if="!audioSrc && hash" class="audio-placeholder">
        <FileAudio :size="40" aria-hidden="true" />
      </div>

      <audio v-if="audioSrc" class="audio-player" :src="audioSrc" controls />
    </div>
  </NodeViewWrapper>
</template>

<style scoped>
.audio-node {
  position: relative;
  display: flex;
  width: 100%;
}
.audio-frame {
  position: relative;
  width: 100%;
  min-height: 56px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 2px solid transparent;
  border-radius: 8px;
  overflow: hidden;
  background: color-mix(in srgb, var(--paragraph) 3%, transparent);
  padding: 8px 10px;
}
.audio-frame--selected {
  border-color: color-mix(in srgb, var(--accent) 65%, transparent);
}
.audio-frame--placeholder {
  justify-content: center;
}
.audio-player {
  width: 100%;
  max-width: 100%;
}
.audio-progress {
  position: absolute;
  bottom: 6px;
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
.audio-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: color-mix(in srgb, var(--paragraph) 60%, transparent);
}
</style>