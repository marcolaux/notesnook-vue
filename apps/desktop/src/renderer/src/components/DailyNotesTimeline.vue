<script setup lang="ts">
/**
 * Daily-notes date timeline — the left-panel replacement for `NotesList` in the
 * Daily Notes mode. A VERTICAL scroller of days: today is centered on entry,
 * previous days above, future days below. Each day row shows weekday + day
 * number + month; a dot marks days that already have a daily note
 * (`daily.dailyDates`). Clicking a day sets the selected date (the
 * `DailyNotesView` watcher opens/creates that day's daily note).
 *
 * A wide static window (±60 days from today) is rendered up front and the
 * selected day is scrolled to the centre via `scrollIntoView`; native vertical
 * scroll + the ↑/↓ buttons (shift the window by a fortnight) reach further out.
 * All date math goes through `utils/daily-notes.ts`.
 */
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Icon } from "@notesnook-vue/ui-vue";
import { useDailyNotesStore } from "@/stores/daily-notes";
import { useNotesStore } from "@/stores/notes";
import { useContextMenuStore } from "@/stores/context-menu";
import { useNoteContextMenu } from "@/composables/use-note-context-menu";
import { addDays, isoDate, parseIsoDate, todayIso } from "@/utils/daily-notes";

const daily = useDailyNotesStore();
const notes = useNotesStore();
const contextMenu = useContextMenuStore();
const { showNoteMenu } = useNoteContextMenu();
const { locale, t } = useI18n();

const todayIsoStr = todayIso();

/** Offset (in days from today) of the FIRST rendered day. Starts at -HALF so
 *  today sits near the centre; the ↑/↓ buttons shift it. Past days render above
 *  (smaller offsets), future days below. */
const HALF = 60;
const windowStart = ref<number>(-HALF);

const scroller = ref<HTMLDivElement | null>(null);

interface DayCell {
  iso: string;
  weekday: string;
  day: string;
  month: string;
  isToday: boolean;
}

const days = computed<DayCell[]>(() => {
  const base = parseIsoDate(todayIsoStr) ?? new Date();
  const out: DayCell[] = [];
  for (let i = windowStart.value; i <= HALF; i++) {
    const d = addDays(base, i);
    const iso = isoDate(d);
    out.push({
      iso,
      weekday: d.toLocaleDateString(locale.value, { weekday: "short" }),
      day: String(d.getDate()),
      month: d.toLocaleDateString(locale.value, { month: "short" }),
      isToday: iso === todayIsoStr
    });
  }
  return out;
});

function selectDay(iso: string): void {
  if (iso === daily.selectedDate) {
    // Re-clicking the already-selected date doesn't change `selectedDate`, so the
    // view's `selectedDate → openDailyNote` watcher won't fire. Call it directly
    // so the note's tab is activated (if open) or re-opened (if its tab was
    // closed) — matching "click the entry → go to that note".
    void daily.openDailyNote(iso);
    return;
  }
  daily.setSelectedDate(iso);
}

/** Whether a date has a daily note (sync memo lookup — no create). */
function hasDailyNote(iso: string): boolean {
  return daily.dailyNoteIdFor(iso) !== null;
}

/** Whether a date has created/modified references (orange dot) — only
 *  meaningful as a dot when there is no daily note. */
function hasReferences(iso: string): boolean {
  return daily.createdModifiedByDate.has(iso);
}

/** Whether any checklist item anywhere mentions this date (checkbox icon). */
function hasTaskRefs(iso: string): boolean {
  return daily.taskRefsByDate.has(iso);
}

/** Right-click a day row: if the date has a daily note, show the SAME note
 *  context menu the notes list shows (pin/favorite/color/tags/notebooks/delete/
 *  publish…); otherwise a single "Create daily note for {date}" action that
 *  creates + opens it (the explicit-create path, vs. a plain click which only
 *  prefills a draft). */
function onDayContext(d: { iso: string }, e: MouseEvent): void {
  const id = daily.dailyNoteIdFor(d.iso);
  if (id) {
    const item = notes.items.find((n) => n.id === id);
    void showNoteMenu(
      {
        id,
        title: d.iso,
        pinned: item?.pinned ?? false,
        favorite: item?.favorite ?? false
      },
      e
    );
    return;
  }
  contextMenu.show(
    [
      {
        id: "create-daily",
        label: t("dailyNotes.createFor", { date: d.iso }),
        onSelect: () => void daily.createDailyNote(d.iso)
      }
    ],
    e.clientX,
    e.clientY
  );
}

/** Centre the selected day in the scroller. Runs on mount and whenever the
 *  selection changes (so following a click or a palette "go to today" keeps the
 *  selected day in view). */
function centerSelected(): void {
  const iso = daily.selectedDate;
  const el = scroller.value?.querySelector(`[data-iso="${iso}"]`) as HTMLElement | null;
  el?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
}

function shiftWindow(deltaDays: number): void {
  windowStart.value += deltaDays;
  void nextTick(centerSelected);
}

onMounted(() => {
  // Refresh the daily-note set so dots are correct on entry, then centre today.
  // Also kick off the task-reference aggregation scan so the checkbox indicators
  // + the references panel's tasks list populate (the store otherwise only
  // re-scans on `notes.items` length change).
  void daily.refreshDailyNotes().finally(() => void nextTick(centerSelected));
  daily.refreshTaskRefs();
});

watch(
  () => daily.selectedDate,
  () => void nextTick(centerSelected)
);
</script>

<template>
  <div class="flex h-full flex-col bg-glass-surface">
    <div class="flex items-center gap-1 px-2 py-2 text-sm font-medium text-text">
      <span class="shrink-0">{{ daily.selectedDate }}</span>
      <button
        class="titlebar-no-drag ml-auto rounded-md p-1 text-text-muted hover:bg-glass-hover hover:text-text"
        :title="$t('common.previous')"
        @click="shiftWindow(-14)"
      >
        <Icon name="chevron-up" :size="16" />
      </button>
      <button
        class="titlebar-no-drag rounded-md p-1 text-text-muted hover:bg-glass-hover hover:text-text"
        :title="$t('common.next')"
        @click="shiftWindow(14)"
      >
        <Icon name="chevron-down" :size="16" />
      </button>
    </div>
    <div
      ref="scroller"
      class="titlebar-no-drag flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2"
    >
      <button
        v-for="d in days"
        :key="d.iso"
        :data-iso="d.iso"
        class="flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
        :class="[
          d.iso === daily.selectedDate
            ? 'bg-glass-active text-text ring-1 ring-[var(--accent)]'
            : d.isToday
              ? 'text-text hover:bg-glass-hover'
              : 'text-text-muted hover:bg-glass-hover hover:text-text'
        ]"
        @click="selectDay(d.iso)"
        @contextmenu.prevent="onDayContext(d, $event)"
      >
        <span class="w-8 shrink-0 text-[10px] uppercase">{{ d.weekday }}</span>
        <span class="text-base font-semibold leading-tight">{{ d.day }}</span>
        <span class="text-[11px] text-text-muted">{{ d.month }}</span>
        <!-- At-a-glance indicators (right-aligned): a checkbox icon when any
             checklist item mentions this date; a dot marking the day — accent
             when a daily note exists, otherwise orange when the day has
             created/modified references (so a no-note day with references still
             draws the eye). -->
        <span class="ml-auto flex shrink-0 items-center gap-1">
          <Icon
            v-if="hasTaskRefs(d.iso)"
            name="square-check-big"
            :size="12"
            class="text-amber-500"
            :title="$t('dailyNotes.tasksOnDay', { n: daily.taskRefsByDate.get(d.iso)?.length ?? 0 })"
          />
          <span
            v-if="hasDailyNote(d.iso)"
            class="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
          />
          <span
            v-else-if="hasReferences(d.iso)"
            class="h-1.5 w-1.5 rounded-full bg-orange-500"
          />
        </span>
      </button>
    </div>
  </div>
</template>