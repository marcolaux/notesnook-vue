<script setup lang="ts">
/**
 * The "Tasks" view — the same notes list + split-layout editor surface as
 * `NotesView`, but with the notes store's Tasks filter active so the list only
 * shows notes containing open tasks (plus fully-completed-task notes when the
 * client-only "Show completed" toggle is on). Detection is content-derived
 * from each note's cached `previews[id].checklist` (`utils/note-preview.ts`).
 *
 * Lifecycle owns the filter flag so entering/leaving the route toggles it:
 * `onMounted` clears any active collection filter (mutual exclusion) and
 * enables the Tasks filter; `onUnmount` disables it. The notes list + editor
 * surface are identical to `/all`, so this is a thin wrapper over `NotesView`'s
 * layout with the filter side-effect.
 */
import { onMounted, onUnmounted, watch } from "vue";
import { useShellStore } from "@/stores/shell";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useEditorStore } from "@/stores/editor";
import { useNotesStore } from "@/stores/notes";
import { useCollectionsStore } from "@/stores/collections";
import NotesList from "@/components/NotesList.vue";
import SplitLayout from "@/components/SplitLayout.vue";
import CollapsiblePanel from "@/components/CollapsiblePanel.vue";
import { LIST_MIN, LIST_MAX } from "@/utils/resizer";

const shell = useShellStore();
const layout = useEditorLayoutStore();
const editorStore = useEditorStore();
const notes = useNotesStore();
const collections = useCollectionsStore();

// Single source of truth for the focused editor (mirrors NotesView).
watch(
  () => layout.activeTab?.id ?? "draft:" + layout.activeGroupId,
  (key) => editorStore.setFocusedKey(key),
  { immediate: true }
);

onMounted(() => {
  // Mutual exclusion with a notebook/tag/color collection filter.
  notes.clearCollectionFilter();
  collections.clearSelection();
  notes.setTasksFilterActive(true);
});

onUnmounted(() => {
  notes.setTasksFilterActive(false);
});
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1">
    <CollapsiblePanel
      :visible="!shell.listCollapsed && !shell.focusMode"
      :width="shell.listWidth"
      :min="LIST_MIN"
      :max="LIST_MAX"
      @resize="shell.setListWidth"
    >
      <NotesList class="h-full backdrop-blur-xl" />
    </CollapsiblePanel>
    <SplitLayout
      v-if="layout.layout"
      :node="layout.layout"
      class="min-w-0 flex-1 backdrop-blur-2xl"
    />
  </div>
</template>