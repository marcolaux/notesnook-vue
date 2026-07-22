<script setup lang="ts">
/**
 * The "All Notes" view (Phase 3.5 + 4.2/4.3) — the NotesList (left) + the
 * split-layout editor surface (right) + the bottom StatusBar. The editor
 * surface is the recursive `SplitLayout` over the editor-layout store's tree:
 * a single group renders one `EditorPane`; a split renders resizable panes with
 * a sash. Per-collection filtering (Notebooks/Tags/Trash/…) is Phase 3.3.
 *
 * The focused-editor key watcher mirrors the layout store's "focused pane"
 * (`activeTab?.id`, or `"draft:"+activeGroupId` for an empty pane) into the
 * editor store so the command palette + editor-command registry target the
 * pane the user is actually in.
 */
import { watch } from "vue";
import { useShellStore } from "@/stores/shell";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useEditorStore } from "@/stores/editor";
import NotesList from "@/components/NotesList.vue";
import SplitLayout from "@/components/SplitLayout.vue";
import StatusBar from "@/components/StatusBar.vue";
import Resizer from "@/components/Resizer.vue";
import { LIST_MIN, LIST_MAX } from "@/utils/resizer";

const shell = useShellStore();
const layout = useEditorLayoutStore();
const editorStore = useEditorStore();

// Single source of truth for the focused editor: the focused pane's active tab
// id, or the draft editor of the active group when it has no tab.
watch(
  () => layout.activeTab?.id ?? "draft:" + layout.activeGroupId,
  (key) => editorStore.setFocusedKey(key),
  { immediate: true }
);
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex min-h-0 min-w-0 flex-1">
      <NotesList
        v-show="!shell.listCollapsed && !shell.focusMode"
        class="shrink-0 backdrop-blur-xl"
        :style="{ width: shell.listWidth + 'px' }"
      />
      <Resizer
        v-show="!shell.listCollapsed && !shell.focusMode"
        :width="shell.listWidth"
        :min="LIST_MIN"
        :max="LIST_MAX"
        @resize="shell.setListWidth"
      />
      <!-- The editor surface renders the layout tree: one EditorPane for a
           single group, or resizable split panes with a sash. Each pane owns
           its own tab strip + a KeepAlive-wrapped per-tab Editor. -->
      <SplitLayout
        v-if="layout.layout"
        :node="layout.layout"
        class="min-w-0 flex-1 backdrop-blur-2xl"
      />
    </div>
    <StatusBar />
  </div>
</template>