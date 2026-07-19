<!--
  Part of the Notesnook Vue port (packages/editor-vue). Row operations menu
  anchored to the row toolbar's "more" button. Actions mirror @notesnook/editor
  row toolbar tools (insert row above/below, delete row, move row up/down,
  toggle header row) + a background-color picker. Color applies via
  setCellAttribute to the current selection.
-->
<script setup lang="ts">
import type { Editor } from "@tiptap/core";
import { moveRowUp, moveRowDown } from "../actions";
import Popover from "./Popover.vue";

const props = defineProps<{ editor: Editor; anchor: HTMLElement | null }>();
const emit = defineEmits<{ close: [] }>();

function run(fn: () => void) {
  fn();
  emit("close");
}
function onBg(e: Event) {
  const value = (e.target as HTMLInputElement).value;
  props.editor.commands.setCellAttribute("backgroundColor", value);
}
</script>

<template>
  <Popover :anchor="anchor" @close="emit('close')">
    <button class="pop-item" @click="run(() => editor.commands.addRowBefore())">Insert row above</button>
    <button class="pop-item" @click="run(() => editor.commands.addRowAfter())">Insert row below</button>
    <button class="pop-item" @click="run(() => editor.commands.deleteRow())">Delete row</button>
    <div class="pop-sep" />
    <button class="pop-item" @click="run(() => moveRowUp(editor))">Move row up</button>
    <button class="pop-item" @click="run(() => moveRowDown(editor))">Move row down</button>
    <div class="pop-sep" />
    <button class="pop-item" @click="run(() => editor.commands.toggleHeaderRow())">Toggle header row</button>
    <div class="pop-sep" />
    <label class="pop-item pop-color">
      <span>Background</span>
      <input type="color" @change="onBg" />
    </label>
  </Popover>
</template>