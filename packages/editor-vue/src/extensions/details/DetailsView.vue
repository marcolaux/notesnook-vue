<script setup lang="ts">
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/vue-3";
import { ChevronRight, ChevronDown } from "@lucide/vue";

const props = defineProps<NodeViewProps>();

function toggleOpen(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  if (typeof props.getPos === "function") {
    const pos = props.getPos();
    if (typeof pos === "number") {
      props.editor.commands.toggleDetails(pos);
    }
  }
}
</script>

<template>
  <NodeViewWrapper
    as="details"
    class="details-node-wrapper"
    :class="{ 'is-open': node.attrs.open }"
    :open="node.attrs.open ? true : undefined"
  >
    <button
      type="button"
      class="details-toggle-btn"
      title="Toggle accordion"
      contenteditable="false"
      @click="toggleOpen"
    >
      <ChevronDown v-if="node.attrs.open" :size="16" />
      <ChevronRight v-else :size="16" />
    </button>
    <NodeViewContent class="details-content-host" />
  </NodeViewWrapper>
</template>
