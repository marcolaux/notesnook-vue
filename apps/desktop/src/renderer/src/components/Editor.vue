<script setup lang="ts">
/**
 * Phase-2.1 spike — a real TipTap editor bound to Notesnook content.
 *
 * Loads the active note's HTML body from `database.content.findByNoteId`,
 * renders it with `@tiptap/vue-3` + `@tiptap/starter-kit` (pure-ProseMirror
 * extensions, no custom node views yet), and autosaves edits back via
 * `database.notes.add` (content upsert + dateEdited bump).
 *
 * Dep note: imports ONLY from `@tiptap/vue-3` and `@tiptap/starter-kit`.
 * Both resolve `@tiptap/core` to the same hoisted copy, so the editor and
 * its extensions share one ProseMirror schema. Importing `@tiptap/core`
 * directly here would grab the nested 2.6.6 copy and split the schema.
 */
import { ref, watch, onBeforeUnmount } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import {
  AttachmentNode,
  TaskItemNode,
  TaskListNode,
  EmbedNode,
  ImageNode,
  CodeBlock,
  Table,
  TableRow,
  TableCell,
  TableHeader
} from "@notesnook-vue/editor-vue";
import { useNotesStore } from "@/stores/notes";

const notes = useNotesStore();

// `useEditor` returns a ShallowRef<Editor | undefined>; in the template it
// auto-unwraps, so `:editor="editor"` passes the Editor instance.
// StarterKit's plain `codeBlock` is disabled in favour of our refractor-backed
// `codeblock` (syntax highlighting + lazy language loading + indent/caret
// tracking); both can't own the ```/~~~ input rules at once.
// Table (2.4h) is configured resizable + showResizeHandleOnSelection: the
// vendored columnResizing plugin draws the resize handles; the Vue
// TableComponent owns the <table>/<colgroup>/<tbody> via addNodeView.
const editor = useEditor({
  extensions: [
    StarterKit.configure({ codeBlock: false }),
    AttachmentNode,
    TaskListNode,
    TaskItemNode.configure({ nested: true }),
    EmbedNode,
    ImageNode,
    CodeBlock,
    Table.configure({ resizable: true, showResizeHandleOnSelection: true }),
    TableRow,
    TableCell,
    TableHeader
  ],
  content: notes.activeContent || "",
  autofocus: false,
  editable: true,
  onUpdate: ({ editor }) => scheduleSave(editor.getHTML())
});

// --- Autosave (debounced), flushed for the previous note on switch ---------
const SAVE_DEBOUNCE_MS = 800;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingNoteId: string | null = null;
let pendingHtml = "";
const saving = ref(false);
const savedAt = ref<number | null>(null);

function scheduleSave(html: string): void {
  const note = notes.activeNote;
  if (!note) return;
  pendingNoteId = note.id;
  pendingHtml = html;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
}

async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const id = pendingNoteId;
  const html = pendingHtml;
  pendingNoteId = null;
  pendingHtml = "";
  if (!id || !html) return;
  saving.value = true;
  await notes.saveContent(id, html);
  saving.value = false;
  savedAt.value = Date.now();
}

// --- Note switching -------------------------------------------------------
/**
 * When the active note changes: flush the previous note's pending edit,
 * load the new note's content, then push it into the editor without
 * triggering an `onUpdate` (so a load never marks the note dirty).
 */
async function onNoteChange(
  newId: string | null | undefined,
  oldId: string | null | undefined
): Promise<void> {
  if (oldId && oldId !== newId && pendingNoteId === oldId) {
    await flushSave();
  }
  if (!newId) return;
  await notes.loadActiveContent();
  const inst = editor.value;
  if (inst) inst.chain().setContent(notes.activeContent || "", false).run();
}

watch(
  () => notes.activeNote?.id ?? null,
  (newId, oldId) => {
    void onNoteChange(newId, oldId);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  void flushSave();
});
</script>

<template>
  <div class="flex h-full flex-col bg-white/5">
    <div class="flex h-9 shrink-0 items-center gap-1 border-b border-white/10 px-2">
      <div class="flex items-end gap-px overflow-x-auto">
        <div
          v-for="tab in notes.openTabs"
          :key="tab.id"
          class="group flex items-center gap-1 border-r border-white/5 bg-white/5 px-3 py-1.5 text-xs text-white/70"
        >
          <span class="max-w-32 truncate">{{ tab.title }}</span>
          <button
            class="opacity-0 group-hover:opacity-100 hover:text-white"
            @click="notes.closeTab(tab.id)"
          >
            ×
          </button>
        </div>
      </div>
      <div class="ml-auto flex items-center gap-2 text-white/50">
        <span v-if="saving" class="text-xs text-white/40">Saving…</span>
        <span v-else-if="savedAt" class="text-xs text-white/30">Saved</span>
        <button class="grid h-6 w-6 place-items-center hover:bg-white/10" title="Search">🔍</button>
        <button class="grid h-6 w-6 place-items-center hover:bg-white/10" title="Table of Contents">📋</button>
      </div>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-6">
      <div v-if="notes.contentState === 'locked'" class="text-sm text-amber-300/80">
        This note is vault-locked. Unlock arrives in Phase 6.
      </div>
      <div v-else-if="notes.contentState === 'error'" class="text-sm text-red-300/80">
        Failed to load note content.
      </div>
      <EditorContent v-else-if="editor" :editor="editor" class="prose prose-invert max-w-none text-sm text-white/80" />
    </div>
  </div>
</template>