<script setup lang="ts">
/**
 * The "All Notes" view (Phase 3.5) — the existing NotesList + Editor panes,
 * extracted verbatim from `App.vue`'s former shell branch. Per-collection
 * filtering (Notebooks/Tags/Trash/…) is Phase 3.3; here the list always shows
 * all notes.
 */
import { useShellStore } from "@/stores/shell";
import NotesList from "@/components/NotesList.vue";
import Editor from "@/components/Editor.vue";

const shell = useShellStore();
</script>

<template>
  <div class="flex min-h-0 flex-1 min-w-0">
    <NotesList
      v-show="!shell.listCollapsed"
      class="w-80 shrink-0 border-r border-white/10 backdrop-blur-xl"
    />
    <Editor class="min-w-0 flex-1 backdrop-blur-2xl" />
  </div>
</template>