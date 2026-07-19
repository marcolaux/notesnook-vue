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

const props = defineProps<NodeViewProps>();

const checked = computed(() => Boolean(props.node.attrs.checked));

function toggle(): void {
  props.updateAttributes({ checked: !checked.value });
}
</script>

<template>
  <NodeViewWrapper
    as="li"
    class="checklist--item group relative flex items-start gap-2"
    :class="{ checked }"
  >
    <span
      data-drag-handle
      class="mt-1 w-3 shrink-0 cursor-grab select-none text-white/20 opacity-0 transition-opacity group-hover:opacity-100"
      >⋮⋮</span
    >
    <button
      type="button"
      class="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors"
      :class="
        checked
          ? 'border-indigo-500 bg-indigo-500 text-white'
          : 'border-white/30 bg-transparent hover:border-white/50'
      "
      @click.prevent="toggle"
      @mousedown.prevent.stop
    >
      <span v-if="checked" class="text-[10px] leading-none">✓</span>
    </button>
    <NodeViewContent as="div" class="min-w-0 flex-1" />
  </NodeViewWrapper>
</template>