<!--
  Part of the Notesnook Vue port (packages/editor-vue). Floating toolbar
  anchored above the selected cell/column. Repositions on selectionUpdate and
  on horizontal scroll of the table's scroll container. Contains "insert
  column right" (＋) and "column properties" (⋯) → popup.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Editor } from "@tiptap/core";
import { Plus, Ellipsis } from "@lucide/vue";
import { findSelectedDOMNode } from "../../../utils/prosemirror";
import TableToolbarButton from "./TableToolbarButton.vue";
import TablePropertiesPopup from "./TablePropertiesPopup.vue";

const props = defineProps<{ editor: Editor; wrapper: HTMLElement | null }>();

const el = ref<HTMLElement | null>(null);
const showProps = ref(false);
let scrollEl: HTMLElement | null = null;

function reposition() {
  if (!el.value) return;
  if (!props.wrapper) {
    el.value.style.display = "none";
    return;
  }
  const cell = findSelectedDOMNode(props.editor, ["tableCell", "tableHeader"]);
  if (!cell || !props.wrapper.contains(cell)) {
    el.value.style.display = "none";
    return;
  }
  const w = props.wrapper.getBoundingClientRect();
  const c = cell.getBoundingClientRect();
  if (c.width === 0 && c.height === 0) {
    el.value.style.display = "none";
    return;
  }
  el.value.style.display = "flex";
  // center over the cell, above it
  el.value.style.left = `${c.left - w.left + c.width / 2 - 14}px`;
  el.value.style.top = `${c.top - w.top - 26}px`;
}

function onUpdate() {
  reposition();
}

watch(
  () => props.wrapper,
  (newW) => {
    if (scrollEl) scrollEl.removeEventListener("scroll", onUpdate, true);
    scrollEl = newW?.querySelector(".scroll-bar") ?? null;
    if (scrollEl) scrollEl.addEventListener("scroll", onUpdate, true);
    reposition();
  }
);

onMounted(() => {
  props.editor.on("selectionUpdate", onUpdate);
  props.editor.on("transaction", onUpdate);
  window.addEventListener("resize", onUpdate);
  window.addEventListener("scroll", onUpdate, true);
  scrollEl = props.wrapper?.querySelector(".scroll-bar") ?? null;
  if (scrollEl) scrollEl.addEventListener("scroll", onUpdate, true);
  reposition();
});

onBeforeUnmount(() => {
  props.editor.off("selectionUpdate", onUpdate);
  props.editor.off("transaction", onUpdate);
  window.removeEventListener("resize", onUpdate);
  window.removeEventListener("scroll", onUpdate, true);
  if (scrollEl) scrollEl.removeEventListener("scroll", onUpdate, true);
});
</script>

<template>
  <div ref="el" class="table-col-toolbar" style="display: none; position: absolute; z-index: 10" contenteditable="false">
    <TableToolbarButton title="Insert column right" @click="editor.commands.addColumnAfter()"><Plus :size="14" /></TableToolbarButton>
    <TableToolbarButton title="Column properties" @click="showProps = !showProps"><Ellipsis :size="14" /></TableToolbarButton>
    <TablePropertiesPopup v-if="showProps" :editor="editor" :anchor="el" @close="showProps = false" />
  </div>
</template>