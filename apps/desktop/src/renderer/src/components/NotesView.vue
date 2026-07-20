<script setup lang="ts">
/**
 * The "All Notes" view (Phase 3.5) — the existing NotesList + Editor panes,
 * extracted verbatim from `App.vue`'s former shell branch. Per-collection
 * filtering (Notebooks/Tags/Trash/…) is Phase 3.3; here the list always shows
 * all notes. The bottom `StatusBar` (Phase 3.4) shows sync status, word
 * count, and the editor cursor position.
 */
import { useShellStore } from "@/stores/shell";
import { useNotesStore } from "@/stores/notes";
import NotesList from "@/components/NotesList.vue";
import Editor from "@/components/Editor.vue";
import StatusBar from "@/components/StatusBar.vue";

const shell = useShellStore();
const notes = useNotesStore();
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex min-h-0 min-w-0 flex-1">
      <NotesList
        v-show="!shell.listCollapsed"
        class="w-80 shrink-0 border-r border-white/10 backdrop-blur-xl"
      />
      <!-- Key the editor by the active note id so switching notes remounts a
           fresh TipTap instance (empty doc) and loads the note's content into
           it. Reusing one editor across notes left the previous note's
           node-views in place and `setContent` could nest the new content
           inside them. -->
      <Editor :key="notes.activeNote?.id ?? 'none'" class="min-w-0 flex-1 backdrop-blur-2xl" />
    </div>
    <StatusBar />
  </div>
</template>