<!--
  Part of the Notesnook Vue port (packages/editor-vue). Floating toolbar
  anchored to the left of the selected row. Repositions on selectionUpdate.
  Contains "insert row below" (＋) and "row properties" (⋯) → popup.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Editor } from "@tiptap/core";
import { Plus, Ellipsis } from "@lucide/vue";
import { findSelectedDOMNode } from "../../../utils/prosemirror";
import TableToolbarButton from "./TableToolbarButton.vue";
import RowPropertiesPopup from "./RowPropertiesPopup.vue";

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
  const row = findSelectedDOMNode(props.editor, ["tableRow"]);
  if (!row || !props.wrapper.contains(row)) {
    el.value.style.display = "none";
    return;
  }
  const w = props.wrapper.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) {
    el.value.style.display = "none";
    return;
  }
  el.value.style.display = "flex";
  el.value.style.left = `${r.left - w.left - 5}px`;
  el.value.style.top = `${r.top - w.top + r.height / 2 - 14}px`;
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
  <div ref="el" class="table-row-toolbar" style="display: none; position: absolute; z-index: 10" contenteditable="false">
    <TableToolbarButton title="Insert row below" @click="editor.commands.addRowAfter()"><Plus :size="14" /></TableToolbarButton>
    <TableToolbarButton title="Row properties" @click="showProps = !showProps"><Ellipsis :size="14" /></TableToolbarButton>
    <RowPropertiesPopup v-if="showProps" :editor="editor" :anchor="el" @close="showProps = false" />
  </div>
</template>