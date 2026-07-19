<!--
  Part of the Notesnook Vue port (packages/editor-vue). Floating toolbar
  anchored to the left of the selected row. Repositions on selectionUpdate.
  Contains "insert row below" (＋) and "row properties" (⋯) → popup.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { Editor } from "@tiptap/core";
import { findSelectedDOMNode } from "../../../utils/prosemirror";
import TableToolbarButton from "./TableToolbarButton.vue";
import RowPropertiesPopup from "./RowPropertiesPopup.vue";

const props = defineProps<{ editor: Editor; wrapper: HTMLElement | null }>();

const el = ref<HTMLElement | null>(null);
const showProps = ref(false);

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

function onSel() {
  reposition();
}

onMounted(() => {
  props.editor.on("selectionUpdate", onSel);
  reposition();
});
onBeforeUnmount(() => {
  props.editor.off("selectionUpdate", onSel);
});
</script>

<template>
  <div ref="el" class="table-row-toolbar" style="display: none; position: absolute; z-index: 10" contenteditable="false">
    <TableToolbarButton title="Insert row below" @click="editor.commands.addRowAfter()">＋</TableToolbarButton>
    <TableToolbarButton title="Row properties" @click="showProps = !showProps">⋯</TableToolbarButton>
    <RowPropertiesPopup v-if="showProps" :editor="editor" :anchor="el" @close="showProps = false" />
  </div>
</template>