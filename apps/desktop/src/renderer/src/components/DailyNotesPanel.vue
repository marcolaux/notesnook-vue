<script setup lang="ts">
/**
 * Daily-notes references panel — for the selected day, lists:
 *  (a) OPEN checklist/task items attributed to that day across three channels
 *      (shown FIRST so the day's actionable items are on top):
 *       1. items whose text MENTIONS the date (in ISO or the user's
 *          `dateFormat`),
 *       2. items inside that day's daily note,
 *       3. items inside notes CREATED that day that don't link to another day;
 *  (b) notes CREATED that day (`dateCreated` in the day range);
 *  (c) notes MODIFIED that day (`dateEdited` in range, excluding (b)).
 *
 * Bound to the timeline's selected date (NOT the open note), so the references
 * show whether or not a daily note exists — listing them for a no-note date is
 * the point of the non-creating draft flow. Created/modified are cheap in-memory
 * filters over `notes.items`. The tasks list comes from the daily-notes store's
 * aggregated `taskRefsByDate` scan — the SAME deduplicated set the timeline's
 * monochrome check + counter uses (so the count above a day and the list below
 * the editor always agree), and only OPEN tasks. Switching days is instant (no
 * per-date re-scan). Clicking any listed note opens it in the active editor
 * group; right-clicking any row shows the same note context menu the notes list
 * shows.
 */
import { computed } from "vue";
import { useNotesStore, type NoteListItem } from "@/stores/notes";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useDailyNotesStore, type TaskMatch } from "@/stores/daily-notes";
import { useNoteContextMenu } from "@/composables/use-note-context-menu";
import { dayRange } from "@/utils/daily-notes";

const props = defineProps<{ date: string }>();

const notes = useNotesStore();
const layout = useEditorLayoutStore();
const daily = useDailyNotesStore();
const { showNoteMenu } = useNoteContextMenu();

const range = computed(() => dayRange(props.date));

const createdToday = computed<NoteListItem[]>(() => {
  const { start, end } = range.value;
  return notes.items.filter((n) => n.dateCreated >= start && n.dateCreated < end);
});

const modifiedToday = computed<NoteListItem[]>(() => {
  const { start, end } = range.value;
  return notes.items.filter(
    (n) =>
      n.dateEdited >= start &&
      n.dateEdited < end &&
      n.dateEdited !== n.dateCreated
  );
});

/** OPEN task items attributed to this date across all three channels — from the
 *  daily store's aggregated scan (the same set the timeline's check + counter
 *  shows). Empty until the idle scan populates `taskRefsByDate`. */
const tasks = computed<TaskMatch[]>(() => daily.taskRefsByDate.get(props.date) ?? []);

function openNote(noteId: string): void {
  layout.openNote(noteId);
}

/** Right-click a created/modified reference row → the same note context menu the
 *  notes list shows (acts on the listed note). */
function onNoteContext(note: NoteListItem, e: MouseEvent): void {
  void showNoteMenu(
    { id: note.id, title: note.title, pinned: note.pinned, favorite: note.favorite },
    e
  );
}

/** Right-click a task row → the context menu for the note containing the task. */
function onTaskContext(task: TaskMatch, e: MouseEvent): void {
  const item = notes.items.find((n) => n.id === task.noteId);
  void showNoteMenu(
    {
      id: task.noteId,
      title: task.noteTitle,
      pinned: item?.pinned ?? false,
      favorite: item?.favorite ?? false
    },
    e
  );
}
</script>

<template>
  <div class="border-t border-glass-border bg-glass-surface px-3 py-2 text-sm">
    <details open>
      <summary class="cursor-pointer select-none py-1 text-text-muted">
        {{ $t("dailyNotes.tasksForDay", { n: tasks.length }) }}
      </summary>
      <ul class="mt-1 flex flex-col gap-0.5">
        <li v-for="t in tasks" :key="t.noteId + '-' + t.itemIndex" class="px-1 py-0.5">
          <button
            class="w-full truncate rounded text-left text-text hover:bg-glass-hover"
            @click="openNote(t.noteId)"
            @contextmenu.prevent="onTaskContext(t, $event)"
          >
            <span class="text-text-muted">{{ t.noteTitle }}: </span>{{ t.itemText }}
          </button>
        </li>
        <li v-if="tasks.length === 0" class="px-1 py-0.5 text-text-muted">
          {{ $t("common.none") }}
        </li>
      </ul>
    </details>

    <details open>
      <summary class="mt-1 cursor-pointer select-none py-1 text-text-muted">
        {{ $t("dailyNotes.createdOnDay", { n: createdToday.length }) }}
      </summary>
      <ul class="mt-1 flex flex-col gap-0.5">
        <li v-for="n in createdToday" :key="n.id">
          <button
            class="w-full truncate rounded px-1 py-0.5 text-left text-text hover:bg-glass-hover"
            @click="openNote(n.id)"
            @contextmenu.prevent="onNoteContext(n, $event)"
          >
            {{ n.title || "Untitled" }}
          </button>
        </li>
        <li v-if="createdToday.length === 0" class="px-1 py-0.5 text-text-muted">
          {{ $t("common.none") }}
        </li>
      </ul>
    </details>

    <details open>
      <summary class="mt-1 cursor-pointer select-none py-1 text-text-muted">
        {{ $t("dailyNotes.modifiedOnDay", { n: modifiedToday.length }) }}
      </summary>
      <ul class="mt-1 flex flex-col gap-0.5">
        <li v-for="n in modifiedToday" :key="n.id">
          <button
            class="w-full truncate rounded px-1 py-0.5 text-left text-text hover:bg-glass-hover"
            @click="openNote(n.id)"
            @contextmenu.prevent="onNoteContext(n, $event)"
          >
            {{ n.title || "Untitled" }}
          </button>
        </li>
        <li v-if="modifiedToday.length === 0" class="px-1 py-0.5 text-text-muted">
          {{ $t("common.none") }}
        </li>
      </ul>
    </details>
  </div>
</template>