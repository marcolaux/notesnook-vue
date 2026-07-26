<script setup lang="ts">
import { computed } from "vue";
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/vue-3";
import { ChevronRight, ChevronDown } from "@lucide/vue";

const props = defineProps<NodeViewProps>();

const headingTag = computed(() => {
  const level = props.node.attrs.level ?? 1;
  return `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
});

function toggleFold() {
  if (typeof props.getPos === "function") {
    const pos = props.getPos();
    if (typeof pos === "number") {
      props.editor.commands.toggleHeadingCollapse(pos);
    }
  }
}
</script>

<template>
  <NodeViewWrapper
    as="div"
    class="heading-node-wrapper"
    :class="{ 'is-collapsed': node.attrs.collapsed }"
    :data-level="node.attrs.level"
  >
    <button
      type="button"
      class="heading-fold-btn"
      :title="node.attrs.collapsed ? 'Expand section' : 'Collapse section'"
      contenteditable="false"
      @click.stop="toggleFold"
    >
      <ChevronRight v-if="node.attrs.collapsed" :size="14" />
      <ChevronDown v-else :size="14" />
    </button>
    <NodeViewContent :as="headingTag" class="heading-content" />
    <span
      v-if="node.attrs.collapsed"
      class="heading-collapsed-badge"
      title="Content collapsed. Click to expand."
      contenteditable="false"
      @click.stop="toggleFold"
    >
      ···
    </span>
  </NodeViewWrapper>
</template>
