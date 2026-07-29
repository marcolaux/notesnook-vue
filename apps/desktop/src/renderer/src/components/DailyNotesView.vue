<script setup lang="ts">
/**
 * The "Daily Notes" view — a date-timeline left panel (instead of `NotesList`)
 * + the shared split-layout editor surface showing the selected day's daily
 * note, with a {@link DailyNotesPanel} beneath the editor listing notes
 * created/modified that day and tasks mentioning that date.
 *
 * Modeled on `TasksView.vue` (the template for a mode that swaps the center
 * column): `onMounted` clears the collection/tasks filters for mutual exclusion;
 * the editor side reuses `SplitLayout` over the editor-layout store unchanged.
 * The daily-notes store owns the selected date; a watcher opens that day's
 * daily note on selection — or, when none exists yet, reveals a prefilled-title
 * DRAFT (the note is created only on first content, not on click), with the
 * references panel listing the day's references either way. Entering the mode
 * thus opens today's daily note (or a prefilled draft) immediately.
 */
import { onMounted, watch } from "vue";
import { useShellStore } from "@/stores/shell";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useEditorStore } from "@/stores/editor";
import { useNotesStore } from "@/stores/notes";
import { useCollectionsStore } from "@/stores/collections";
import { useDailyNotesStore } from "@/stores/daily-notes";
import SplitLayout from "@/components/SplitLayout.vue";
import CollapsiblePanel from "@/components/CollapsiblePanel.vue";
import DailyNotesTimeline from "@/components/DailyNotesTimeline.vue";
import { LIST_MIN, LIST_MAX } from "@/utils/resizer";

const shell = useShellStore();
const layout = useEditorLayoutStore();
const editorStore = useEditorStore();
const notes = useNotesStore();
const collections = useCollectionsStore();
const daily = useDailyNotesStore();

// Single source of truth for the focused editor (mirrors NotesView/TasksView).
watch(
  () => layout.activeTab?.id ?? "draft:" + layout.activeGroupId,
  (key) => editorStore.setFocusedKey(key),
  { immediate: true }
);

onMounted(() => {
  // Mutual exclusion with a notebook/tag/color collection + the Tasks filter.
  notes.clearCollectionFilter();
  collections.clearSelection();
  notes.setTasksFilterActive(false);
});

// Opening the selected day's daily note follows the selection. Runs
// immediately on mount so today's daily note opens (or a prefilled draft
// appears) when the mode is entered. `openDailyNote` does NOT create: if the
// date has no daily note it reveals a prefilled-title draft (the note is
// created on first content). The references panel lives inside the editor
// (per-tab for an open daily note, per-draft for a no-note date) — see
// `Editor.vue`'s `dailyPanelDate` — NOT here in the view.
watch(
  () => daily.selectedDate,
  (iso) => {
    void daily.openDailyNote(iso);
  },
  { immediate: true }
);

// If the selected date's daily note disappears (deleted via the timeline
// context menu, or pulled away), fall back to the prefilled draft for that
// date so the editor doesn't sit on a closed tab with no prefill. Reacts ONLY
// to the daily-note set (`dailyDates`), not to selection changes — so picking a
// no-note date (which already ran `openDailyNote` above) doesn't double-fire.
// The first `dailyDates` change is the mount-time `refreshDailyNotes` populate
// and is skipped (the selection watcher already handled mount).
let skipFirstDailyDatesChange = true;
watch(
  () => daily.dailyDates,
  () => {
    if (skipFirstDailyDatesChange) {
      skipFirstDailyDatesChange = false;
      return;
    }
    if (!daily.dailyDates.has(daily.selectedDate)) {
      void daily.openDailyNote(daily.selectedDate);
    }
  }
);
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
      <DailyNotesTimeline class="h-full" />
    </CollapsiblePanel>
    <SplitLayout
      v-if="layout.layout"
      :node="layout.layout"
      class="min-w-0 flex-1 backdrop-blur-2xl"
    />
  </div>
</template>