<script setup lang="ts">
/*
Embed node-view — a sandboxed iframe that can be resized via a bottom-right
handle and dragged as a block node. Ported from @notesnook/editor's React
`EmbedComponent` (extensions/embed/component.tsx, GPL-3.0); the React
`createNodeView` layer is replaced by `NodeViewWrapper` from @tiptap/vue-3.

Scoped differences from upstream (this 2.4b increment):
  - No `corsHost` rewrite for YouTube (CORS-proxy host lives in the toolbar
    store / settings; arrives with the toolbar in Phase 2.5). The iframe loads
    `src` directly.
  - No Twitter/X `srcDoc` rendering (needs the theme engine for the dark-mode
    flag); Twitter URLs load as a plain iframe src for now. The `src` still
    round-trips unchanged.
  - No in-node toolbar (align-left/center/right + properties) — that is the
    Phase 2.5 toolbar. `align` is still stored + round-tripped; the resizer
    + selection ring + drag handle are present so the node is fully editable.
  - `textDirection`-derived alignment default is gone (text-direction extension
    not ported); an unset `align` falls back to "left".
  - Loading spinner is a CSS spinner (no `@notesnook/ui` Icon / theme).
*/
import { computed, ref } from "vue";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/vue-3";
import Resizer from "../../components/Resizer.vue";
import { getSandboxFeatures } from "../../utils/sandbox";
import type { EmbedAttributes, EmbedAlignmentOptions } from "./types";

const props = defineProps<NodeViewProps>();

const isLoading = ref(true);

const src = computed(() => String(props.node.attrs.src ?? ""));
const width = computed(() => (props.node.attrs.width as number | null) ?? null);
const height = computed(() => (props.node.attrs.height as number | null) ?? null);
const align = computed<NonNullable<EmbedAlignmentOptions["align"]>>(
  () => (props.node.attrs.align as EmbedAlignmentOptions["align"]) ?? "left"
);

const justifyClass = computed(() =>
  align.value === "center"
    ? "justify-center"
    : align.value === "right"
      ? "justify-end"
      : "justify-start"
);

const sandbox = computed(() => getSandboxFeatures(src.value));
const youTube = computed(() => isYouTubeEmbed(src.value));
const allow = computed(() => (youTube.value ? YOUTUBE_ALLOW : undefined));
const referrerPolicy = computed(() => (youTube.value ? "origin" : undefined));

function onResize(w: number, h: number): void {
  // Live-commit the new size; `setEmbedSize` dispatches a history-tracked
  // transaction so a resize is undoable (matches upstream's addToHistory).
  props.editor.commands.setEmbedSize({ width: w, height: h });
}

function isYouTubeEmbed(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return (
      (url.hostname === "www.youtube.com" ||
        url.hostname === "youtube.com" ||
        url.hostname === "m.youtube.com" ||
        url.hostname === "www.youtube-nocookie.com" ||
        url.hostname === "youtube-nocookie.com") &&
      url.pathname.startsWith("/embed/")
    );
  } catch {
    return false;
  }
}

const YOUTUBE_ALLOW = [
  "accelerometer",
  "autoplay",
  "clipboard-write",
  "encrypted-media",
  "gyroscope",
  "picture-in-picture",
  "web-share"
].join("; ");
</script>

<template>
  <NodeViewWrapper as="div" class="embed-node" :class="justifyClass">
    <Resizer
      :enabled="editor.isEditable"
      :selected="props.selected"
      :width="width"
      :height="height"
      :lock-aspect-ratio="false"
      :min-width="135"
      @resize="onResize"
    >
      <div class="embed-frame" :class="{ 'embed-frame--selected': props.selected }">
        <div
          v-if="editor.isEditable"
          class="embed-drag"
          data-drag-handle
          title="Drag to move"
        >
          ⠿
        </div>
        <iframe
          v-if="src"
          :src="src"
          :sandbox="sandbox"
          :allow="allow"
          :referrer-policy="referrerPolicy"
          allowfullscreen
          width="100%"
          height="100%"
          class="embed-iframe"
          @load="isLoading = false"
        />
        <div v-else class="embed-placeholder">No embed source</div>
        <div v-if="isLoading && src" class="embed-loading" aria-hidden="true">
          <span class="embed-spinner" />
        </div>
      </div>
    </Resizer>
  </NodeViewWrapper>
</template>

<style scoped>
.embed-node {
  position: relative;
  display: flex;
  width: 100%;
}
.embed-frame {
  position: relative;
  width: 100%;
  border: 2px solid transparent;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03);
}
.embed-frame--selected {
  border-color: rgba(99, 102, 241, 0.65);
}
.embed-iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: transparent;
}
.embed-drag {
  position: absolute;
  top: -22px;
  right: 0;
  padding: 2px 6px;
  font-size: 14px;
  line-height: 1;
  color: rgba(160, 160, 180, 0.7);
  cursor: grab;
  user-select: none;
}
.embed-drag:active {
  cursor: grabbing;
}
.embed-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80px;
  color: rgba(200, 200, 220, 0.5);
  font-size: 13px;
}
.embed-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 20, 30, 0.25);
}
.embed-spinner {
  width: 22px;
  height: 22px;
  border: 2px solid rgba(160, 160, 180, 0.3);
  border-top-color: rgba(160, 160, 180, 0.85);
  border-radius: 50%;
  animation: embed-spin 0.8s linear infinite;
}
@keyframes embed-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>