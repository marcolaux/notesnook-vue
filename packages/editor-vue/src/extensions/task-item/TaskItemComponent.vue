<script setup lang="ts">
/*
Task item node-view — a checklist row: a drag grip, a checkbox toggle, and
the editable content (the paragraph) via <NodeViewContent>. Toggling the
checkbox calls `updateAttributes({ checked })`; the task-list stats plugin
syncs the parent list's progress bar from these attrs.
*/
import { computed } from "vue";
import { NodeViewWrapper, NodeViewContent } from "@tiptap/vue-3";
import type { NodeViewProps } from "@tiptap/vue-3";
import { Check } from "@lucide/vue";

const props = defineProps<NodeViewProps>();

const checked = computed(() => Boolean(props.node.attrs.checked));
// Visual indent level (Tab/Shift-Tab) → left padding. 0 leaves the row
// untouched so the stored `data-indent` attribute stays absent for legacy
// notes that predate the indent feature.
const indent = computed(() => Number(props.node.attrs.indent ?? 0));
const indentStyle = computed(() =>
  indent.value > 0 ? { paddingLeft: `${indent.value * 20}px` } : undefined
);

function toggle(): void {
  props.updateAttributes({ checked: !checked.value });
}
</script>

<template>
  <NodeViewWrapper
    as="li"
    class="checklist--item group relative flex items-start gap-2"
    :class="{ checked }"
    :style="indentStyle"
  >
    <span
      data-drag-handle
      draggable="true"
      contenteditable="false"
      class="mt-0 w-3 shrink-0 cursor-grab select-none whitespace-nowrap text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
      >⠿</span
    >
    <button
      type="button"
      class="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors"
      :class="
        checked
          ? 'border-indigo-500 bg-indigo-500 text-white'
          : 'border-glass-active bg-transparent hover:border-text-muted'
      "
      @click.prevent="toggle"
      @mousedown.prevent.stop
    >
      <Check v-if="checked" :size="10" />
    </button>
    <NodeViewContent as="div" class="min-w-0 flex-1" />
  </NodeViewWrapper>
</template>