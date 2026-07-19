import { defineStore } from "pinia";
import { shallowRef, computed } from "vue";
import type { Editor } from "@tiptap/vue-3";

/**
 * Cross-component channel for the active TipTap `Editor` instance.
 *
 * `Editor.vue` owns the editor via `useEditor` (a local `ShallowRef`), but the
 * command palette (Phase 2.5) and the editor-action command registry need to
 * reach `editor.chain()` from outside `Editor.vue`. `useEditorStore` is that
 * channel: `Editor.vue` publishes the instance on create and clears it on
 * destroy; consumers (palette store, editor commands, slash-command handlers)
 * read `editor` here.
 *
 * The ref is a `shallowRef` — the Editor is a large, self-managed object; deep
 * reactivity would be wasteful and could interfere with ProseMirror's own state.
 * `isEditable` is the only reactive view consumers need.
 */
export const useEditorStore = defineStore("editor", () => {
  const editor = shallowRef<Editor | undefined>(undefined);

  function set(e: Editor | undefined): void {
    editor.value = e;
  }

  function clear(): void {
    editor.value = undefined;
  }

  const isEditable = computed(() => editor.value?.isEditable ?? false);

  return { editor, set, clear, isEditable };
});