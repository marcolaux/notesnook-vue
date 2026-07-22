<script setup lang="ts">
/*
Attachment node-view — an inline, non-editable chip showing the file's icon,
name, and size. The blob itself (download/preview) arrives with attachments
auth (Phase 6); rendering here uses only the stored attrs. `data-drag-handle`
on the inner chip marks the drag handle, matching the upstream convention.
*/
import { computed, type Component } from "vue";
import { NodeViewWrapper } from "@tiptap/vue-3";
import type { NodeViewProps } from "@tiptap/vue-3";
import { Image, FileText } from "@lucide/vue";
import { formatBytes } from "../../utils/formatBytes";
import type { FileAttachment } from "./types";

const props = defineProps<NodeViewProps>();

const attrs = computed<FileAttachment>(() => props.node.attrs as FileAttachment);
const sizeLabel = computed(() => formatBytes(Number(attrs.value.size) || 0));
const icon = computed<Component>(() =>
  String(attrs.value.mime || "").startsWith("image/") ? Image : FileText
);

/**
 * Double-click opens the attachment in a preview tab (a new right-hand pane).
 * The host renderer installs `editor.storage.openAttachmentPreview` (via the
 * attachments bridge); this pure package stays db-free and just delegates. A
 * no-op when the hook is absent (e.g. in tests that don't wire the bridge), so
 * the chip remains inert there. `stop`+`prevent` keep the dblclick from
 * disturbing the ProseMirror selection / triggering atom drag.
 */
function onDblClick(): void {
  const hook = (props.editor.storage as Record<string, unknown>).openAttachmentPreview;
  if (typeof hook === "function") hook(attrs.value);
}
</script>

<template>
  <NodeViewWrapper as="span" class="inline-flex select-none" contenteditable="false">
    <span
      data-drag-handle
      class="inline-flex items-center gap-1.5 rounded-md border border-glass-border bg-glass-hover px-2 py-0.5 text-xs text-text transition-shadow"
      :class="{ 'ring-2 ring-indigo-400/70': props.selected }"
      title="Double-click to preview"
      @dblclick.stop.prevent="onDblClick"
    >
      <component :is="icon" :size="12" aria-hidden="true" />
      <span class="max-w-[12rem] truncate">{{ attrs.filename || "Untitled" }}</span>
      <span class="text-text-muted">{{ sizeLabel }}</span>
    </span>
  </NodeViewWrapper>
</template>