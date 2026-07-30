<script setup lang="ts">
/*
Node-view for the collapsible list item. Mirrors OutlineListItemView so a
bullet list and an outline list render identically: every item draws its own
`•` marker (the native ::marker is suppressed via CSS), and items that contain
a child `bulletList`/`orderedList` additionally render a chevron toggle in the
left gutter. Ordered lists keep their native numbers — CSS hides the dot for
`ol`. Clicking the chevron flips the child list's `collapsed` attribute (an
attribute change, not a structural edit — the subtree stays in the doc and is
hidden via CSS).
*/
import { computed } from "vue";
import { NodeViewWrapper, NodeViewContent, nodeViewProps } from "@tiptap/vue-3";

const props = defineProps(nodeViewProps);

/** List node types whose collapse this item controls. */
const COLLAPSIBLE_CHILD_TYPES = new Set(["bulletList", "orderedList"]);

/** Whether this item contains a child bullet/ordered list (i.e. is a parent). */
const hasChildList = computed(() => {
  let found = false;
  props.node.forEach((child) => {
    if (COLLAPSIBLE_CHILD_TYPES.has(child.type.name)) {
      found = true;
    }
  });
  return found;
});

/** Whether the (first) child list is currently collapsed. */
const isChildCollapsed = computed(() => {
  let collapsed = false;
  props.node.forEach((child) => {
    if (COLLAPSIBLE_CHILD_TYPES.has(child.type.name) && child.attrs.collapsed) {
      collapsed = true;
    }
  });
  return collapsed;
});

/** Toggle the collapsed state of the first child list node. */
function toggleCollapse(): void {
  const ed = props.editor;
  if (!ed) return;
  const pos = props.getPos();
  if (typeof pos !== "number") return;

  let childListPos = -1;
  let childListAttrs: Record<string, unknown> | null = null;
  props.node.forEach((child, offset) => {
    if (
      childListPos === -1 &&
      COLLAPSIBLE_CHILD_TYPES.has(child.type.name)
    ) {
      childListPos = pos + 1 + offset;
      childListAttrs = child.attrs as Record<string, unknown>;
    }
  });

  if (childListPos !== -1 && childListAttrs) {
    const attrs = childListAttrs as Record<string, unknown>;
    const tr = ed.view.state.tr.setNodeMarkup(childListPos, undefined, {
      ...attrs,
      collapsed: !attrs.collapsed
    });
    ed.view.dispatch(tr);
  }
}
</script>

<template>
  <NodeViewWrapper
    as="li"
    class="collapsible-list-item"
    :class="{ 'has-list-child': hasChildList }"
  >
    <!-- Drag-to-reorder grip (the `ListDragReorder` plugin moves this item and
         any nested subtree as a group). Lives in the left gutter, left of the
         chevron, and is revealed on hover via CSS. `data-drag-handle` +
         `draggable="true"` let TipTap's NodeView turn a grip drag into a
         NodeSelection the plugin reads. -->
    <span
      class="collapsible-drag-grip"
      data-drag-handle
      draggable="true"
      contenteditable="false"
      title="Drag to move"
      >⠿</span
    >
    <!-- Self-drawn `•` marker, identical to the outline list's dot. The native
         ::marker is suppressed via CSS (`list-style:none` on `ul`), so this dot
         IS the bullet. It is rendered for every item (leaf + parent), matching
         the outline list; CSS hides it for ordered lists (`ol` keep numbers). -->
    <span class="collapsible-bullet-dot" contenteditable="false">•</span>
    <button
      v-if="hasChildList"
      type="button"
      class="collapsible-toggle-btn"
      :class="{ 'is-collapsed': isChildCollapsed }"
      title="Toggle collapse"
      contenteditable="false"
      @click="toggleCollapse"
    >
      <svg
        class="collapsible-toggle-icon"
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
    <NodeViewContent class="collapsible-item-content" />
  </NodeViewWrapper>
</template>