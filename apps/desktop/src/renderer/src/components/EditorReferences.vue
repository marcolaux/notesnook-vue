<script setup lang="ts">
/**
 * Editor footer "References" section — the single place the footer shows notes
 * related to the open note, replacing the former separate `DailyNotesPanel` +
 * the title-only backlink chips. Rendered inside the editor's scroll area (part
 * of the footer), per-pane.
 *
 * Two kinds of references, all as rich cards (title + tag pills + excerpt) via
 * {@link ReferenceCard} — except daily tasks, which stay as task rows (the
 * checklist *block*, not the whole note):
 *
 *  1. Backlinks — notes that link TO this pane's note (`incoming`, a
 *     `NoteLinkRef[]` from the per-pane footer composable). Enriched to full
 *     {@link NoteListItem} cards by joining the in-memory `notes.items` list
 *     (which already carries title/headline/tags/color). A backlink not in
 *     `items` (trashed/archived) degrades to a title-only card.
 *  2. Daily-note references — only when `dailyDate` is set (an open daily note's
 *     own day, or a prefilled daily draft's pending day): the day's OPEN tasks
 *     (rows), notes created that day (cards), and notes modified that day
 *     (cards). Ported verbatim from the deleted `DailyNotesPanel.vue` — same
 *     in-memory `notes.items` filters + the daily store's aggregated
 *     `taskRefsByDate` scan, so the counts still match the timeline dots.
 *
 * Clicking any card/row opens the note in THIS pane's group (`layout.openTab`);
 * right-click shows the same note context menu the notes list shows.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useNotesStore, type NoteListItem } from "@/stores/notes";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useDailyNotesStore, type TaskMatch } from "@/stores/daily-notes";
import { useNoteContextMenu } from "@/composables/use-note-context-menu";
import { dayRange } from "@/utils/daily-notes";
import type { NoteLinkRef } from "@/stores/links";
import ReferenceCard from "./ReferenceCard.vue";

const props = defineProps<{
  /** Backlinks for this pane's note (from the per-pane footer composable). */
  incoming: NoteLinkRef[];
  /** The day whose daily references to show, or `null` for a non-daily note. */
  dailyDate: string | null;
  /** This pane's group — reference notes open here (matches `openLinkedNote`). */
  groupId: string;
}>();

const notes = useNotesStore();
const layout = useEditorLayoutStore();
const daily = useDailyNotesStore();
const { showNoteMenu } = useNoteContextMenu();
const { t } = useI18n();

/** Backlinks enriched to card data: prefer the full in-memory list item (it
 *  already has tags/headline/color); fall back to a title-only card for a
 *  backlink not in `items` (trashed/archived — `relations.to().resolve()`
 *  returns trashed notes too, but `notes.all` excludes them). */
const incomingCards = computed<NoteListItem[]>(() =>
  props.incoming.map((l) => {
    const live = notes.items.find((n) => n.id === l.id);
    if (live) return live;
    return {
      id: l.id,
      title: l.title,
      headline: "",
      dateCreated: 0,
      dateEdited: 0,
      tags: [],
      pinned: false,
      favorite: false
    };
  })
);

const range = computed(() => (props.dailyDate ? dayRange(props.dailyDate) : null));

const createdToday = computed<NoteListItem[]>(() => {
  const r = range.value;
  if (!r) return [];
  return notes.items.filter((n) => n.dateCreated >= r.start && n.dateCreated < r.end);
});

const modifiedToday = computed<NoteListItem[]>(() => {
  const r = range.value;
  if (!r) return [];
  return notes.items.filter(
    (n) =>
      n.dateEdited >= r.start &&
      n.dateEdited < r.end &&
      n.dateEdited !== n.dateCreated
  );
});

/** OPEN task items attributed to this date — the daily store's aggregated scan
 *  (the same set the timeline's check + counter shows). Empty until the idle
 *  scan populates `taskRefsByDate`. */
const tasks = computed<TaskMatch[]>(
  () => (props.dailyDate ? daily.taskRefsByDate.get(props.dailyDate) ?? [] : [])
);

/** Whether the section is shown at all. For a daily date the section ALWAYS
 *  renders (the tasks/created/modified groups show "None" placeholders when
 *  empty — mirroring the former `DailyNotesPanel`, so clicking a timeline date
 *  always surfaces the day's reference groups even on a quiet day or a no-note
 *  draft). For a non-daily note the section only renders when there are
 *  backlinks (no empty "References" header for a note with no references). */
const showSection = computed(
  () => props.dailyDate !== null || incomingCards.value.length > 0
);

function openNote(noteId: string): void {
  layout.openTab(props.groupId, noteId);
}

/** Right-click a task row → the context menu for the note containing the task.
 *  (Cards handle their own context menu internally via `ReferenceCard`.) */
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
  <div v-if="showSection" class="editor-references mt-4 border-t border-glass-border pt-3 text-xs text-text-muted">
    <div class="mb-1.5 font-medium text-text">{{ t("editor.references") }}</div>

    <!-- Backlinks: notes linking TO this note. Shown for every note. -->
    <details v-if="incomingCards.length > 0" open>
      <summary class="cursor-pointer select-none py-1 text-text-muted">
        {{ t("editor.backlinks", { n: incomingCards.length }) }}
      </summary>
      <div class="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <ReferenceCard
          v-for="n in incomingCards"
          :key="'in-' + n.id"
          :note="n"
          @open="openNote"
        />
      </div>
    </details>

    <template v-if="dailyDate">
      <!-- Tasks for this day: listed as task blocks (not whole-note cards). -->
      <details open>
        <summary class="mt-1 cursor-pointer select-none py-1 text-text-muted">
          {{ t("dailyNotes.tasksForDay", { n: tasks.length }) }}
        </summary>
        <ul class="mt-1 flex flex-col gap-0.5">
          <li v-for="task in tasks" :key="task.noteId + '-' + task.itemIndex" class="px-1 py-0.5">
            <button
              class="w-full truncate rounded text-left text-text hover:bg-glass-hover"
              @click="openNote(task.noteId)"
              @contextmenu.prevent="onTaskContext(task, $event)"
            >
              <span class="text-text-muted">{{ task.noteTitle }}: </span>{{ task.itemText }}
            </button>
          </li>
          <li v-if="tasks.length === 0" class="px-1 py-0.5 text-text-muted">
            {{ t("common.none") }}
          </li>
        </ul>
      </details>

      <!-- Notes created on this day. -->
      <details open>
        <summary class="mt-1 cursor-pointer select-none py-1 text-text-muted">
          {{ t("dailyNotes.createdOnDay", { n: createdToday.length }) }}
        </summary>
        <div v-if="createdToday.length > 0" class="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <ReferenceCard
            v-for="n in createdToday"
            :key="'created-' + n.id"
            :note="n"
            @open="openNote"
          />
        </div>
        <div v-else class="px-1 py-0.5 text-text-muted">{{ t("common.none") }}</div>
      </details>

      <!-- Notes modified on this day. -->
      <details open>
        <summary class="mt-1 cursor-pointer select-none py-1 text-text-muted">
          {{ t("dailyNotes.modifiedOnDay", { n: modifiedToday.length }) }}
        </summary>
        <div v-if="modifiedToday.length > 0" class="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <ReferenceCard
            v-for="n in modifiedToday"
            :key="'modified-' + n.id"
            :note="n"
            @open="openNote"
          />
        </div>
        <div v-else class="px-1 py-0.5 text-text-muted">{{ t("common.none") }}</div>
      </details>
    </template>
  </div>
</template>