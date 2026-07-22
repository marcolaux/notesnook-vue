<script setup lang="ts">
/*
Tag-mention chip node-view (Phase 5.4). Renders a non-editable inline `#title`
pill. The visible text comes from the node's cached `title` attr; the wrapping
`<span>` carries `data-tag-id`/`data-tag-title` for round-trip (see
`tag-mention.ts`). Styling follows `AttachmentComponent.vue` (Tailwind + the
renderer's glass theme tokens).

Interaction:
  - Click the chip label → navigate to that tag's note list. The editor package
    has no router/stores, so the host injects a `navigateToTag(tagId)` hook onto
    `editor.storage` (see `wireTagMention` in the renderer); if absent (e.g. an
    isolated test editor) the click is a graceful no-op. `preventDefault` +
    `stopPropagation` keep ProseMirror from selecting the atom node on click.
  - Click the `×` button → `deleteNode()`. That dispatches a user transaction,
    which the bridge's transaction listener detects (the chip's `tagId`
    disappears) and turns into a `removeTag` unassign — so removing the inline
    chip also unlinks the tag from the note, mirroring the editor footer chips
    and the backspace-delete path. `@click.stop` on the button prevents the
    label's navigate handler from also firing.
*/
import { computed } from "vue";
import { NodeViewWrapper } from "@tiptap/vue-3";
import type { NodeViewProps } from "@tiptap/vue-3";
import type { TagMentionAttributes } from "./types";

const props = defineProps<NodeViewProps>();

const attrs = computed<TagMentionAttributes>(() => props.node.attrs as TagMentionAttributes);
const label = computed(() => `#${attrs.value.title || "tag"}`);

function onChipClick(e: MouseEvent): void {
  // Don't navigate when the editor is read-only / no tag id is resolvable.
  const id = attrs.value.tagId;
  if (!id) return;
  e.preventDefault();
  e.stopPropagation();
  const storage = props.editor.storage as Record<string, unknown>;
  const go = storage.navigateToTag as ((tagId: string | null) => void) | undefined;
  go?.(id);
}

function onRemoveClick(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  props.deleteNode();
}
</script>

<template>
  <NodeViewWrapper as="span" class="inline-flex select-none" contenteditable="false">
    <span
      class="group inline-flex items-center gap-1 rounded-full border border-glass-border bg-glass-hover px-2 py-0.5 text-xs text-text transition-shadow hover:bg-glass-active"
      :class="{ 'ring-2 ring-indigo-400/70': props.selected }"
    >
      <button
        type="button"
        class="max-w-40 cursor-pointer truncate"
        :title="`Show notes tagged #${attrs.title || 'tag'}`"
        @click="onChipClick"
      >{{ label }}</button>
      <button
        type="button"
        class="text-text-muted opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
        title="Remove tag"
        @click="onRemoveClick"
      >&times;</button>
    </span>
  </NodeViewWrapper>
</template>