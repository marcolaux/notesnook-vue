<script setup lang="ts">
import { computed } from "vue";
import { NodeViewWrapper, NodeViewContent, nodeViewProps } from "@tiptap/vue-3";

const props = defineProps(nodeViewProps);

/** Check if this outline list item contains a child outline list node. */
const hasChildList = computed(() => {
  let found = false;
  props.node.forEach((child) => {
    if (child.type.name === "outlineList") {
      found = true;
    }
  });
  return found;
});

/** Check if the child outline list node is currently collapsed. */
const isChildCollapsed = computed(() => {
  let collapsed = false;
  props.node.forEach((child) => {
    if (child.type.name === "outlineList" && child.attrs.collapsed) {
      collapsed = true;
    }
  });
  return collapsed;
});

/** Toggle the collapsed state of the child outline list node. */
function toggleCollapse(): void {
  const ed = props.editor;
  if (!ed) return;
  const pos = props.getPos();
  if (typeof pos !== "number") return;

  let childListPos = -1;
  let childListAttrs: Record<string, any> | null = null;
  props.node.forEach((child: any, offset: number) => {
    if (child.type.name === "outlineList") {
      childListPos = pos + 1 + offset;
      childListAttrs = child.attrs as Record<string, any>;
    }
  });

  if (childListPos !== -1 && childListAttrs) {
    const attrs = childListAttrs as Record<string, any>;
    const tr = ed.view.state.tr.setNodeMarkup(childListPos, undefined, {
      ...attrs,
      collapsed: !attrs.collapsed
    });
    ed.view.dispatch(tr);
  }
}
</script>

<template>
  <NodeViewWrapper as="li" data-type="outlineListItem" class="outline-list-item-wrapper">
    <button
      v-if="hasChildList"
      type="button"
      class="outline-toggle-btn"
      :class="{ 'is-collapsed': isChildCollapsed }"
      title="Toggle collapse"
      contenteditable="false"
      @click="toggleCollapse"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
    <span v-else class="outline-bullet-dot" contenteditable="false">•</span>
    <NodeViewContent class="outline-item-content" />
  </NodeViewWrapper>
</template>
