<script setup lang="ts">
/*
Attachment node-view — an inline, non-editable chip showing the file's icon,
name, and size. The blob itself (download/preview) arrives with attachments
auth (Phase 6); rendering here uses only the stored attrs. `data-drag-handle`
on the inner chip marks the drag handle, matching the upstream convention.
*/
import { computed } from "vue";
import { NodeViewWrapper } from "@tiptap/vue-3";
import type { NodeViewProps } from "@tiptap/vue-3";
import { formatBytes } from "../../utils/formatBytes";
import type { FileAttachment } from "./types";

const props = defineProps<NodeViewProps>();

const attrs = computed<FileAttachment>(() => props.node.attrs as FileAttachment);
const sizeLabel = computed(() => formatBytes(Number(attrs.value.size) || 0));
const icon = computed(() =>
  String(attrs.value.mime || "").startsWith("image/") ? "🖼️" : "📄"
);
</script>

<template>
  <NodeViewWrapper as="span" class="inline-flex select-none" contenteditable="false">
    <span
      data-drag-handle
      class="inline-flex items-center gap-1.5 rounded-md border border-glass-border bg-glass-hover px-2 py-0.5 text-xs text-text transition-shadow"
      :class="{ 'ring-2 ring-indigo-400/70': props.selected }"
    >
      <span aria-hidden="true">{{ icon }}</span>
      <span class="max-w-[12rem] truncate">{{ attrs.filename || "Untitled" }}</span>
      <span class="text-text-muted">{{ sizeLabel }}</span>
    </span>
  </NodeViewWrapper>
</template>