<script setup lang="ts">
/**
 * Recursive split-layout renderer (Phase 4.2/4.3) — walks the editor-layout
 * store's `LayoutNode` tree and renders it:
 *  - a `"group"` leaf → an `<EditorPane :group-id>` (tab strip + editor);
 *  - a `"split"` node → a flex row (`direction==="vertical"`, children
 *    side-by-side) or column (`"horizontal"`, stacked) of its children, with a
 *    draggable sash between adjacent children.
 *
 * Each child's flex-grow is its persisted `size` ratio, or an equal `1/n`
 * share when no size has been set yet (so fresh splits are equal until the
 * user drags a sash). The sash is a custom pointer-based handle (no external
 * dep — `ui-vue` has no splitter); dragging it calls
 * `layout.resizeSplitChildren(splitId, childIndex, fraction)`, which writes the
 * two adjacent children's `size` (clamped to `[0.05, 0.95]`).
 *
 * Self-referential: a `<SplitLayout>` renders `<SplitLayout>` for each child,
 * so the tree depth is unbounded.
 */
import { computed, ref } from "vue";
import type { LayoutNode } from "@/utils/editor-layout";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import EditorPane from "./EditorPane.vue";

const props = defineProps<{ node: LayoutNode }>();
const layout = useEditorLayoutStore();

const isSplit = computed(() => props.node.type === "split");
const direction = computed(() => props.node.direction ?? "vertical");
const children = computed(() => props.node.children ?? []);

/** Flex-grow for a child: its persisted `size` ratio, or an equal share. */
function flexGrow(child: LayoutNode): number {
  return typeof child.size === "number" ? child.size : 1 / children.value.length;
}

// --- Sash drag (pointer events) --------------------------------------------
const containerEl = ref<HTMLElement | null>(null);
let dragState: {
  index: number;
  startPx: number;
  totalPx: number;
  startFraction: number;
} | null = null;

function onSashPointerDown(e: PointerEvent, index: number): void {
  const container = containerEl.value;
  if (!container) return;
  e.preventDefault();
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  const rect = container.getBoundingClientRect();
  const vert = direction.value === "vertical";
  dragState = {
    index,
    startPx: vert ? e.clientX : e.clientY,
    totalPx: vert ? rect.width : rect.height,
    startFraction:
      typeof children.value[index]?.size === "number"
        ? (children.value[index]!.size as number)
        : 1 / children.value.length
  };
}

function onSashPointerMove(e: PointerEvent): void {
  if (!dragState) return;
  const vert = direction.value === "vertical";
  const currentPx = vert ? e.clientX : e.clientY;
  const deltaFraction = dragState.totalPx > 0 ? (currentPx - dragState.startPx) / dragState.totalPx : 0;
  layout.resizeSplitChildren(props.node.id, dragState.index, dragState.startFraction + deltaFraction);
}

function onSashPointerUp(e: PointerEvent): void {
  if (!dragState) return;
  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  dragState = null;
}
</script>

<template>
  <div
    v-if="isSplit"
    ref="containerEl"
    class="flex min-h-0 min-w-0 flex-1"
    :class="direction === 'vertical' ? 'flex-row' : 'flex-col'"
  >
    <template v-for="(child, i) in children" :key="child.id">
      <div
        class="flex min-h-0 min-w-0 flex-1"
        :style="{ flexGrow: flexGrow(child), flexBasis: '0%' }"
      >
        <SplitLayout :node="child" />
      </div>
      <div
        v-if="i < children.length - 1"
        class="shrink-0 bg-glass-border transition-colors hover:bg-accent"
        :class="direction === 'vertical' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'"
        style="touch-action: none"
        @pointerdown="onSashPointerDown($event, i)"
        @pointermove="onSashPointerMove($event)"
        @pointerup="onSashPointerUp($event)"
      />
    </template>
  </div>
  <EditorPane v-else :group-id="node.groupId!" />
</template>