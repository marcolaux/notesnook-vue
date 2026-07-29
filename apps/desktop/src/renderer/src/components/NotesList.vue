<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { Icon } from "@notesnook-vue/ui-vue";
import { useNotesStore } from "@/stores/notes";
import { useCollectionsStore } from "@/stores/collections";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useColorsStore } from "@/stores/colors";
import { useContextMenuStore } from "@/stores/context-menu";
import { useSettingsStore } from "@/stores/settings";
import { groupNotes, highlightSegments, type SortKey, type GroupKey } from "@/utils/notes-list";
import { desktop } from "@/platform/desktop-bridge";
import {
  writeNotePayload,
  resetNoteDropHandled,
  consumeNoteDropHandled
} from "@/utils/note-dnd";
import { useNoteContextMenu } from "@/composables/use-note-context-menu";
import type { NotePreview } from "@/utils/note-preview";
import type { NoteListItem } from "@/stores/notes";

const notes = useNotesStore();
const collections = useCollectionsStore();
const layout = useEditorLayoutStore();
const colors = useColorsStore();
const contextMenu = useContextMenuStore();
const settings = useSettingsStore();
const router = useRouter();
const { t } = useI18n();
const { showNoteMenu, showMultiNoteMenu } = useNoteContextMenu();

/** In-flight note drag: the OS screen point where it started + the grabbed
 *  note id. The grabbed note is what a cross-window release opens (one note →
 *  one window, matching tab tear-off); the rest of the selection only travels
 *  with the payload for sidebar assignment drops. Cleared on `dragend`. */
const noteDragStart = ref<{ x: number; y: number; noteId: string } | null>(null);

/** Grouped view of the sorted+filtered list. Flat mode returns one headerless
 * group so the template iterates uniformly; `none` never shows a header. */
const groups = computed(() => groupNotes(notes.visibleItems, notes.groupKey));

/** Label for the active collection-filter chip. The collections store's
 *  `selectedLabel` covers notebook/tag (it owns those lists); color selection
 *  is resolved here from the colors store so the collections store stays
 *  color-agnostic. */
const collectionLabel = computed(() => {
  const s = collections.selected;
  if (s?.type === "color") return colors.items.find((c) => c.id === s.id)?.title ?? t("notesList.color");
  return collections.selectedLabel;
});

/** IntersectionObserver for lazy-loading note entry previews & thumbnails when scrolled into view */
let listObserver: IntersectionObserver | null = null;

function setupListObserver(): void {
  if (typeof IntersectionObserver === "undefined") return;
  listObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const noteId = (entry.target as HTMLElement).dataset.noteId;
          if (noteId) {
            void notes.loadPreview(noteId);
            listObserver?.unobserve(entry.target);
          }
        }
      }
    },
    { rootMargin: "150px 0px" }
  );
}

const vLazyPreview = {
  mounted(el: HTMLElement, binding: { value: string }) {
    const noteId = binding.value;
    if (!noteId) return;
    if (notes.previews[noteId]) return;
    el.dataset.noteId = noteId;
    if (!listObserver) setupListObserver();
    listObserver?.observe(el);
  },
  unmounted(el: HTMLElement) {
    listObserver?.unobserve(el);
  }
};

/** Typed lookup of a note's list preview (thumbnail + checklist progress). */
function previewOf(id: string): NotePreview | undefined {
  return notes.previews[id];
}

/** Progress-bar width (%) for a note's checklist, or 0 when none. */
function progressWidth(preview: NotePreview): number {
  const c = preview.checklist;
  if (!c || c.total === 0) return 0;
  return (c.checked / c.total) * 100;
}

/** Search-match segments for a note field (empty query → one plain run, so
 * the `<mark>` only renders while a search is active). */
function segmentsOf(text: string): { text: string; match: boolean }[] {
  return highlightSegments(text, notes.query, { regex: notes.regexSearch });
}

/** Clear the active collection filter (chip × or "All Notes"). */
function clearCollectionFilter(): void {
  notes.clearCollectionFilter();
  collections.clearSelection();
}

/** Leave the Tasks view (chip ×): drop the filter and return to All Notes. */
function clearTasksFilter(): void {
  notes.setTasksFilterActive(false);
  void router.push("/all");
}

/** Whether a row should render the multi-selection treatment (accent bg +
 *  ring + checkmark). Only when MORE than one note is selected — so a lone
 *  selection never reads as "multi-select". This matters for right-click:
 *  `onNoteContext` reconciles the selection to the right-clicked row (so its
 *  menu acts on that note), but a single selected row that isn't the open
 *  note must NOT light up as if it were multi-selected; the active note keeps
 *  its `bg-glass-active` "open" highlight, and the lone non-active selection
 *  shows no special treatment. When count > 1, every selected row (including
 *  the active one) joins the treatment so the whole set reads as one. */
function noteRowSelected(id: string): boolean {
  return notes.isSelected(id) && notes.selectedCount > 1;
}

/** Whether a row is the target of the currently-open context menu — so it
 *  keeps a dashed outline while the menu is open, marking which note the menu
 *  acts on (the menu floats away from the row, so without it the target is
 *  ambiguous once the cursor moves to the menu). Cleared by `close` + every
 *  `show`, so it never lingers after the menu closes or switches source. */
function noteRowContext(id: string): boolean {
  return contextMenu.contextId === id;
}

/** Plain / cmd / shift click on a note row (file-manager semantics):
 *  shift → range-select from the anchor (no open); cmd/ctrl → toggle
 *  membership (no open); plain → collapse selection to the note AND open it. */
function onNoteClick(note: NoteListItem, e: MouseEvent): void {
  if (e.shiftKey) return notes.extendSelection(note.id);
  if (e.metaKey || e.ctrlKey) return notes.toggleSelection(note.id);
  notes.selectOnly(note.id);
}

/** Begin dragging a note row (file-manager semantics): when the grabbed row is
 *  part of the current multi-selection the whole selection travels with the
 *  drag; otherwise the drag carries just this note and the selection collapses
 *  to it so the highlight matches the dragged set. The payload is read by
 *  sidebar drop targets (Notebook / Tag / Color / Archive / Trash) AND the
 *  editor-area drop targets (tab strip, editor-pane split zone). Records the
 *  start screen point + grabbed note id so `onNoteDragEnd` can tear off into a
 *  new window when the drag is released outside every window (mirroring tab
 *  tear-off via `desktop.window.releaseTab`).
 *
 *  The selection collapse uses `setSelection` (NOT `selectOnly`) deliberately:
 *  `selectOnly` also calls `layout.openNote`, which would open the grabbed note
 *  in the active pane the instant the drag starts — defeating a drag onto
 *  another pane/tab strip (the note would already be a tab there, so the drop
 *  target's `openTab` would reuse it in place and an edge-split would create an
 *  empty sibling). `setSelection` selects without any editor effect, so the
 *  drag truly carries the note without opening it. Plain-click still opens via
 *  `onNoteClick → selectOnly`; only the drag path is opening-free. */
function onNoteDragStart(note: NoteListItem, e: DragEvent): void {
  const ids = notes.isSelected(note.id) ? [...notes.selectedNoteIds] : [note.id];
  if (!notes.isSelected(note.id)) notes.setSelection([note.id]);
  writeNotePayload(e, { ids });
  resetNoteDropHandled();
  const screenX = window.screenX + e.clientX;
  const screenY = window.screenY + e.clientY;
  noteDragStart.value = { x: screenX, y: screenY, noteId: note.id };
}


/** A note drag released outside every window (or over another app window) opens
 *  the grabbed note in a new window / the target window — the same
 *  `desktop.window.releaseTab` path tab tear-off uses (main resolves moved-vs-
 *  toreOff from the live cursor + every window's OS bounds). Skipped when a
 *  within-window sidebar target already consumed the drop (an assignment).
 *  Unlike a tab tear-off, there is no source tab to close — the note stays put
 *  in this window; the drag simply additionally opens it elsewhere. */
async function onNoteDragEnd(): Promise<void> {
  const start = noteDragStart.value;
  noteDragStart.value = null;
  if (!start) return;
  if (consumeNoteDropHandled()) return; // a sidebar assignment handled it
  try {
    await desktop.window.releaseTab.mutate({
      noteId: start.noteId,
      startScreenX: start.x,
      startScreenY: start.y
    });
  } catch {
    // main unreachable — leave the note in place
  }
}

/** Right-click a note row → show the per-note OR multi-selection context menu.
 *
 *  If the right-clicked row is part of an existing multi-selection (size > 1),
 *  the menu acts on the whole selection (bulk actions). If it is NOT selected,
 *  the selection collapses to that row and the single-note menu is shown. The
 *  menu itself (entry building + assignment-snapshot fetch + dep wiring) lives
 *  in the shared `useNoteContextMenu` composable so the Daily Notes timeline +
 *  references panel show the exact same menu. Here we only reconcile the
 *  selection (file-manager semantics) then hand off. */
async function onNoteContext(
  note: { id: string; title: string; pinned: boolean; favorite: boolean },
  e: MouseEvent
): Promise<void> {
  // Reconcile selection: right-clicking outside the selection collapses to the
  // clicked row (mirrors file managers).
  if (!notes.isSelected(note.id)) notes.setSelection([note.id]);

  if (notes.selectedCount > 1) {
    await showMultiNoteMenu([...notes.selectedNoteIds], e, note.id);
    return;
  }
  await showNoteMenu(note, e);
}

const sortKeys = computed<{ value: SortKey; label: string }[]>(() => [
  { value: "dateEdited", label: t("notesList.sortModified") },
  { value: "dateCreated", label: t("notesList.sortCreated") },
  { value: "title", label: t("notesList.sortTitle") }
]);

const groupKeys = computed<{ value: GroupKey; label: string }[]>(() => [
  { value: "none", label: t("notesList.groupNone") },
  { value: "date", label: t("notesList.groupDate") }
]);

function formatDate(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric"
  });
}
</script>

<template>
  <div class="flex h-full flex-col bg-glass-surface">
    <!-- The search input moved to the title bar (global search); this header
         row now only holds the New Note button + the count/sort/selection
         readouts. It wraps to a second line when the chips + grouping/sort
         controls exceed the available width (e.g. a Tasks filter chip + a
         collection chip + the sort controls on a narrow list). -->
    <div class="flex min-h-7 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-glass-border px-3 text-[10px] text-text-muted">
      <button
        class="titlebar-no-drag grid h-5 w-5 shrink-0 place-items-center rounded-sm text-text-muted hover:bg-glass-hover"
        :title="notes.tasksFilterActive ? t('notesList.newTask') : t('notesList.newNote')"
        @click="notes.tasksFilterActive ? notes.create({ task: true }) : notes.create()"
      >
        <Icon name="plus" :size="14" />
      </button>
      <span class="shrink-0">{{ notes.visibleItems.length }}</span>
      <!-- Multi-selection readout: "N selected" with a Clear button. Shown only
           while more than one note is selected. -->
      <span
        v-if="notes.selectedCount > 1"
        class="titlebar-no-drag flex shrink-0 items-center gap-1 rounded-full bg-glass-hover px-1.5 py-0.5 text-text-muted"
      >
        <span>{{ t("notesList.selected", { n: notes.selectedCount }) }}</span>
        <button
          class="grid h-3.5 w-3.5 place-items-center rounded-full text-text-muted hover:bg-glass-active hover:text-text"
          :title="t('notesList.clearSelection')"
          @click="notes.clearSelection()"
        >
          <Icon name="x" :size="8" :stroke-width="3" />
        </button>
      </span>
      <!-- Active collection filter (notebook/tag/color) with a clear (×) button. -->
      <span
        v-if="notes.collectionFilter && collectionLabel"
        class="titlebar-no-drag flex shrink-0 items-center gap-1 rounded-full bg-glass-hover px-1.5 py-0.5 text-text-muted"
      >
        <span
          v-if="collections.selected?.type === 'color'"
          class="inline-block h-2 w-2 shrink-0 rounded-full"
          :style="{ background: colors.items.find((c) => c.id === collections.selected!.id)?.colorCode }"
        />
        <span class="max-w-[10rem] truncate">{{ collectionLabel }}</span>
        <button
          class="grid h-3.5 w-3.5 place-items-center rounded-full text-text-muted hover:bg-glass-active hover:text-text"
          :title="t('notesList.clearCollectionFilter')"
          @click="clearCollectionFilter()"
        >
          <Icon name="x" :size="8" :stroke-width="3" />
        </button>
      </span>
      <!-- Tasks-view filter chip with a clear (×) button + inline "Show completed"
           toggle (only while the Tasks filter is active). -->
      <span
        v-if="notes.tasksFilterActive"
        class="titlebar-no-drag flex shrink-0 items-center gap-1.5 rounded-full bg-glass-hover px-1.5 py-0.5 text-text-muted"
      >
        <Icon name="list-checks" :size="11" />
        <span>{{ t("notesList.tasks") }}</span>
        <label
          class="flex items-center gap-1"
          :title="t('notesList.showCompletedTitle')"
        >
          <input
            type="checkbox"
            class="h-3 w-3 accent-[var(--accent)]"
            :checked="settings.tasksShowCompleted"
            @change="settings.setTasksShowCompleted(($event.target as HTMLInputElement).checked)"
          />
          <span class="text-[0.7rem]">{{ t("notesList.completed") }}</span>
        </label>
        <button
          class="grid h-3.5 w-3.5 place-items-center rounded-full text-text-muted hover:bg-glass-active hover:text-text"
          :title="t('notesList.leaveTasks')"
          @click="clearTasksFilter()"
        >
          <Icon name="x" :size="8" :stroke-width="3" />
        </button>
      </span>
      <span class="ml-auto flex shrink-0 items-center gap-1">
        <select
          class="titlebar-no-drag rounded-sm border border-glass-border bg-glass-surface px-1 py-0.5 text-text-muted focus:outline-none"
          :value="notes.groupKey"
          :title="t('notesList.groupBy')"
          @change="notes.setGroupKey(($event.target as HTMLSelectElement).value as GroupKey)"
        >
          <option v-for="g in groupKeys" :key="g.value" :value="g.value">{{ g.label }}</option>
        </select>
        <select
          class="titlebar-no-drag rounded-sm border border-glass-border bg-glass-surface px-1 py-0.5 text-text-muted focus:outline-none"
          :value="notes.sortKey"
          :title="t('notesList.sortBy')"
          @change="notes.setSortKey(($event.target as HTMLSelectElement).value as SortKey)"
        >
          <option v-for="k in sortKeys" :key="k.value" :value="k.value">{{ k.label }}</option>
        </select>
        <button
          class="titlebar-no-drag grid h-5 w-5 place-items-center rounded-sm text-text-muted hover:bg-glass-hover"
          :title="notes.sortDir === 'asc' ? t('notesList.ascending') : t('notesList.descending')"
          @click="notes.toggleSortDir()"
        >
          <Icon :name="notes.sortDir === 'asc' ? 'arrow-up' : 'arrow-down'" :size="10" />
        </button>
      </span>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-1">
      <template v-for="group in groups" :key="group.key">
        <div
          v-if="group.label"
          class="sticky top-0 z-10 bg-glass-surface px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-text-muted"
        >
          {{ group.label }}
        </div>
        <button
          v-for="note in group.items"
          :key="note.id"
          v-lazy-preview="note.id"
          class="note-row block w-full rounded-md px-2 py-1.5 text-left hover:bg-glass-hover"
          :class="{
            'bg-glass-active': notes.activeNote?.id === note.id && !noteRowSelected(note.id),
            'note-row-selected': noteRowSelected(note.id),
            'context-target-row': noteRowContext(note.id),
            'has-tint': !!note.color
          }"
          :style="note.color ? { '--note-tint': note.color.colorCode } : undefined"
          draggable="true"
          @click="onNoteClick(note, $event)"
          @contextmenu.prevent="onNoteContext(note, $event)"
          @dragstart="onNoteDragStart(note, $event)"
          @dragend="onNoteDragEnd"
        >
          <div class="flex items-center gap-1">
            <!-- Multi-selection checkmark (shown when the row is part of the
                 multi-selection but is not the open/active note — the active
                 note already shows bg-glass-active). -->
            <Icon
              v-if="noteRowSelected(note.id)"
              name="check"
              :size="10"
              class="text-accent"
              :title="t('common.selected')"
            />
            <Icon v-if="note.pinned" name="pin" :size="10" class="text-amber-500 thin-outline" fill="currentColor" :title="t('notesList.pinned')" />
            <Icon v-if="note.favorite" name="star" :size="10" class="text-amber-500 thin-outline" fill="currentColor" :title="t('notesList.shortcut')" />
            <Icon v-if="notes.publishedIds.has(note.id)" name="globe" :size="10" class="text-text-muted" :title="t('notesList.published')" />
            <span class="truncate text-xs font-medium text-text">
              <template v-for="(seg, i) in segmentsOf(note.title)" :key="i">
                <mark v-if="seg.match" class="rounded-sm bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] px-0.5 text-text">{{ seg.text }}</mark>
                <template v-else>{{ seg.text }}</template>
              </template>
            </span>
          </div>
          <div class="mt-1 flex items-start gap-2">
            <!-- First-image thumbnail (supports inline src + attachment-backed data-hash images). -->
            <img
              v-if="previewOf(note.id)?.thumbnail"
              :src="previewOf(note.id)!.thumbnail ?? undefined"
              alt=""
              class="h-8 w-8 shrink-0 rounded-sm object-cover"
              draggable="false"
            />
            <div class="min-w-0 flex-1">
              <div class="truncate text-[10px] text-text-muted">
                <template v-if="note.headline">
                  <template v-for="(seg, i) in segmentsOf(note.headline)" :key="i">
                    <mark v-if="seg.match" class="rounded-sm bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] px-0.5 text-text-muted">{{ seg.text }}</mark>
                    <template v-else>{{ seg.text }}</template>
                  </template>
                </template>
                <template v-else>{{ t("common.noAdditionalText") }}</template>
              </div>
            </div>
          </div>
          <!-- Date + checklist progress share one line; tags wrap to a new
               line when the row is too narrow to fit them alongside. The tag
               group is a single shrink-0 flex item, so flex-wrap drops the
               whole group at once (rather than splitting individual tags);
               max-w-full + internal flex-wrap keeps tags from overflowing on
               very narrow rows. -->
          <div class="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9px] text-text-muted">
            <span class="shrink-0">{{ formatDate(note.dateEdited) }}</span>
            <template v-if="previewOf(note.id)?.checklist && previewOf(note.id)!.checklist!.total > 0">
              <div class="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-glass-hover">
                <div
                  class="h-full rounded-full bg-[var(--accent-success)]"
                  :style="{ width: `${progressWidth(previewOf(note.id)!)}%` }"
                />
              </div>
              <span class="shrink-0 text-[8px] text-text-muted">
                {{ previewOf(note.id)!.checklist!.checked }}/{{ previewOf(note.id)!.checklist!.total }}
              </span>
            </template>
            <span
              v-if="note.tags.length"
              class="flex max-w-full shrink-0 flex-wrap gap-1"
            >
              <span
                v-for="tag in note.tags.slice(0, 3)"
                :key="tag"
                class="shrink-0 rounded-sm bg-glass-hover px-1 text-[8px] text-text-muted"
              >#{{ tag }}</span>
            </span>
          </div>
        </button>
      </template>
      <div v-if="notes.visibleItems.length === 0 && notes.query" class="px-2 py-4 text-center text-[10px] text-text-muted">
        {{ t("notesList.noMatch", { query: notes.query }) }}
      </div>
      <div v-else-if="notes.items.length === 0" class="px-2 py-4 text-center text-[10px] text-text-muted">
        {{ t("notesList.empty") }}
      </div>
    </div>
  </div>
</template>

<style scoped>
/* A note row with an assigned color gets a subtle tinted background (a "slight
   version" of the color for readability). The raw color is passed as the
   `--note-tint` CSS var; `color-mix` overlays it at low alpha for the rest,
   higher on hover, highest when active — so the tint reads at a glance without
   swamping the text. These rules outrank the Tailwind hover/active bg classes
   for tinted rows (higher specificity), and fall through to them otherwise. */
.note-row.has-tint {
  background-color: color-mix(in srgb, var(--note-tint) 14%, transparent);
}
.note-row.has-tint:hover {
  background-color: color-mix(in srgb, var(--note-tint) 22%, transparent);
}
.note-row.has-tint.bg-glass-active {
  background-color: color-mix(in srgb, var(--note-tint) 32%, transparent);
}
/* A row that is part of the multi-selection (but not the open/active note, which
   shows bg-glass-active). A subtle accent bg + a ring so a selected+ tinted
   row still reads as selected (the tint's bg rules above win for tinted rows,
   so the ring carries the selection signal there). */
.note-row.note-row-selected {
  background-color: color-mix(in srgb, var(--color-accent, #3b82f6) 18%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-accent, #3b82f6) 50%, transparent);
}
</style>