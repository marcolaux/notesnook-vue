<!--
  Part of the Notesnook Vue port (packages/editor-vue). Column operations menu
  anchored to the column toolbar's "more" button (upstream calls this
  "TableProperties"). Actions: insert/delete/move column, toggle header
  column, cell color + border styling, and cell-level merge/split/toggle-header
  (operate on the current CellSelection). Colors/border apply via
  setCellAttribute to the current selection.
-->
<script setup lang="ts">
import type { Editor } from "@tiptap/core";
import { moveColumnLeft, moveColumnRight } from "../actions";
import Popover from "./Popover.vue";

const props = defineProps<{ editor: Editor; anchor: HTMLElement | null }>();
const emit = defineEmits<{ close: [] }>();

function run(fn: () => void) {
  fn();
  emit("close");
}
function setAttr(name: string, e: Event) {
  const value = (e.target as HTMLInputElement | HTMLSelectElement).value;
  props.editor.commands.setCellAttribute(
    name,
    name === "borderWidth" ? Number(value) : value
  );
}
</script>

<template>
  <Popover :anchor="anchor" @close="emit('close')">
    <button class="pop-item" @click="run(() => editor.commands.addColumnBefore())">Insert column before</button>
    <button class="pop-item" @click="run(() => editor.commands.addColumnAfter())">Insert column after</button>
    <button class="pop-item" @click="run(() => editor.commands.deleteColumn())">Delete column</button>
    <div class="pop-sep" />
    <button class="pop-item" @click="run(() => moveColumnLeft(editor))">Move column left</button>
    <button class="pop-item" @click="run(() => moveColumnRight(editor))">Move column right</button>
    <div class="pop-sep" />
    <button class="pop-item" @click="run(() => editor.commands.toggleHeaderColumn())">Toggle header column</button>
    <div class="pop-sep" />
    <label class="pop-item pop-color"><span>Background</span><input type="color" @change="setAttr('backgroundColor', $event)" /></label>
    <label class="pop-item pop-color"><span>Text</span><input type="color" @change="setAttr('color', $event)" /></label>
    <label class="pop-item pop-color"><span>Border</span><input type="color" @change="setAttr('borderColor', $event)" /></label>
    <label class="pop-item">Border width
      <input type="number" min="0" max="20" @change="setAttr('borderWidth', $event)" />
    </label>
    <label class="pop-item">Border style
      <select @change="setAttr('borderStyle', $event)">
        <option value="solid">solid</option>
        <option value="dashed">dashed</option>
        <option value="dotted">dotted</option>
        <option value="none">none</option>
      </select>
    </label>
    <div class="pop-sep" />
    <button class="pop-item" @click="run(() => editor.commands.mergeCells())">Merge cells</button>
    <button class="pop-item" @click="run(() => editor.commands.splitCell())">Split cell</button>
    <button class="pop-item" @click="run(() => editor.commands.toggleHeaderCell())">Toggle header cell</button>
  </Popover>
</template>