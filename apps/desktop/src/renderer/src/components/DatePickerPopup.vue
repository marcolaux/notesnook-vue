<script setup lang="ts">
/**
 * Date-picker popup for the "Date" slash / "Insert date" palette command. A real
 * month-calendar grid (teleported to `<body>`) the mouse AND keyboard can drive:
 *
 *   • Mouse — click any day to insert it; ◀ / ▶ in the header change the month.
 *   • Keyboard — ←/→ ±1 day, ↑/↓ ±7 days (prev/next row), PageUp/PageDown ±1
 *     month, Home/End = start/end of month, Enter inserts the highlighted day,
 *     Escape closes. Today is highlighted on open; the view month follows the
 *     selection across month boundaries.
 *
 * Driven by `useInsertDateStore`; mounted once in `App.vue`. Keyboard is captured
 * via a window-level `keydown` listener (capture phase + `stopPropagation`) so
 * the editor — which may still hold focus — doesn't also move its caret while
 * the picker is open. Outside-click closes.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Icon } from "@notesnook-vue/ui-vue";
import { useInsertDateStore } from "@/stores/insert-date";
import { isoDate, parseIsoDate, todayIso } from "@/utils/daily-notes";

const store = useInsertDateStore();
const { locale } = useI18n();

const panel = ref<HTMLElement | null>(null);

/** The displayed month (independent of the selection so ◀/▶ can browse without
 *  moving the highlight). Synced to the selected date on open + whenever the
 *  selection moves outside the current view (arrow-key month crossing). */
const viewYear = ref(new Date().getFullYear());
const viewMonth = ref(new Date().getMonth());

const todayIsoStr = computed(() => todayIso());

/** Locale's first day of the week (0=Sun..6=Sat); falls back to Sunday when
 *  `Intl.Locale.weekInfo` is unavailable. */
const firstDayOfWeek = computed<number>(() => {
  try {
    const fd = (new Intl.Locale(locale.value) as { weekInfo?: { firstDayOfWeek?: number } })
      .weekInfo?.firstDayOfWeek;
    if (typeof fd === "number") return fd;
  } catch {
    /* ignore — fall back to Sunday */
  }
  return 0;
});

/** Weekday header labels (narrow, e.g. S/M/T/W/T/F/S) starting on the locale's
 *  first day. 2024-01-07 is a Sunday (getDay()===0), so day `7 + firstDay + i`. */
const weekdayHeaders = computed<string[]>(() => {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(2024, 0, 7 + firstDayOfWeek.value + i);
    out.push(d.toLocaleDateString(locale.value, { weekday: "narrow" }));
  }
  return out;
});

/** "February 2026" header label for the displayed month. */
const monthLabel = computed(() =>
  new Date(viewYear.value, viewMonth.value, 1).toLocaleDateString(locale.value, {
    month: "long",
    year: "numeric"
  })
);

interface DayCell {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
}

/** A 6-week × 7-day grid for the displayed month, starting on the locale's first
 *  weekday. Leading/trailing days from the adjacent months are shown dimmed. */
const grid = computed<DayCell[]>(() => {
  const first = new Date(viewYear.value, viewMonth.value, 1);
  const startOffset = (first.getDay() - firstDayOfWeek.value + 7) % 7;
  const start = new Date(viewYear.value, viewMonth.value, 1 - startOffset);
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = isoDate(d);
    cells.push({
      iso,
      day: d.getDate(),
      inMonth: d.getMonth() === viewMonth.value,
      isToday: iso === todayIsoStr.value,
      isSelected: iso === store.selected
    });
  }
  return cells;
});

/** Clamped popup position so it stays on-screen (approx 248×260 panel). */
const posStyle = computed(() => {
  const w = 248;
  const h = 264;
  const left = Math.max(8, Math.min(store.x, window.innerWidth - w - 8));
  const top = Math.max(8, Math.min(store.y, window.innerHeight - h - 8));
  return { left: `${left}px`, top: `${top}px` };
});

function prevMonth(): void {
  if (viewMonth.value === 0) {
    viewMonth.value = 11;
    viewYear.value -= 1;
  } else {
    viewMonth.value -= 1;
  }
}
function nextMonth(): void {
  if (viewMonth.value === 11) {
    viewMonth.value = 0;
    viewYear.value += 1;
  } else {
    viewMonth.value += 1;
  }
}

/** Keep the view month in sync with the selection when arrow keys cross a month
 *  boundary (so the highlighted day stays visible). ◀/▶ month buttons change the
 *  view without touching the selection, so this watcher doesn't fire for them. */
watch(
  () => store.selected,
  (iso) => {
    const d = parseIsoDate(iso);
    if (d && (d.getFullYear() !== viewYear.value || d.getMonth() !== viewMonth.value)) {
      viewYear.value = d.getFullYear();
      viewMonth.value = d.getMonth();
    }
  }
);

// When the popup opens, centre the view on the selected (today) date.
watch(
  () => store.open,
  (isOpen) => {
    if (!isOpen) return;
    const d = parseIsoDate(store.selected) ?? new Date();
    viewYear.value = d.getFullYear();
    viewMonth.value = d.getMonth();
  }
);

function onKey(e: KeyboardEvent): void {
  if (!store.open) return;
  switch (e.key) {
    case "ArrowRight":
      e.preventDefault();
      e.stopPropagation();
      store.shiftDays(1);
      break;
    case "ArrowLeft":
      e.preventDefault();
      e.stopPropagation();
      store.shiftDays(-1);
      break;
    case "ArrowDown":
      e.preventDefault();
      e.stopPropagation();
      store.shiftDays(7);
      break;
    case "ArrowUp":
      e.preventDefault();
      e.stopPropagation();
      store.shiftDays(-7);
      break;
    case "PageDown":
      e.preventDefault();
      e.stopPropagation();
      store.shiftMonths(1);
      break;
    case "PageUp":
      e.preventDefault();
      e.stopPropagation();
      store.shiftMonths(-1);
      break;
    case "Home":
      e.preventDefault();
      e.stopPropagation();
      store.goToMonthStart();
      break;
    case "End":
      e.preventDefault();
      e.stopPropagation();
      store.goToMonthEnd();
      break;
    case "Enter":
      e.preventDefault();
      e.stopPropagation();
      store.confirm();
      break;
    case "Escape":
      e.preventDefault();
      e.stopPropagation();
      store.close();
      break;
  }
}

/** Outside-click (mousedown) closes the picker. The panel stops mousedown so its
 *  own clicks don't close it. */
function onDocMouseDown(e: MouseEvent): void {
  if (!store.open) return;
  if (panel.value && !panel.value.contains(e.target as Node)) {
    store.close();
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKey, true);
  document.addEventListener("mousedown", onDocMouseDown, true);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey, true);
  document.removeEventListener("mousedown", onDocMouseDown, true);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="store.open"
      ref="panel"
      class="date-picker-popup fixed z-50 w-[248px] rounded-lg border border-glass-border bg-glass-surface p-2 text-text shadow-lg backdrop-blur-2xl"
      :style="posStyle"
      @mousedown.stop
    >
      <!-- Month header: ◀ February 2026 ▶ -->
      <div class="mb-1 flex items-center gap-1">
        <button
          type="button"
          class="titlebar-no-drag rounded-md p-1 text-text-muted hover:bg-glass-hover hover:text-text"
          :title="$t('common.previous')"
          @click="prevMonth"
        >
          <Icon name="chevron-left" :size="14" />
        </button>
        <span class="min-w-0 flex-1 truncate text-center text-xs font-semibold">{{ monthLabel }}</span>
        <button
          type="button"
          class="titlebar-no-drag rounded-md p-1 text-text-muted hover:bg-glass-hover hover:text-text"
          :title="$t('common.next')"
          @click="nextMonth"
        >
          <Icon name="chevron-right" :size="14" />
        </button>
      </div>
      <!-- Weekday headers -->
      <div class="grid grid-cols-7 text-center text-[9px] uppercase text-text-muted">
        <span v-for="(w, i) in weekdayHeaders" :key="i" class="py-0.5">{{ w }}</span>
      </div>
      <!-- Day grid -->
      <div class="grid grid-cols-7 gap-0.5 text-center text-[11px]">
        <button
          v-for="c in grid"
          :key="c.iso"
          type="button"
          class="titlebar-no-drag h-7 rounded-md leading-7 transition-colors"
          :class="[
            c.isSelected
              ? 'bg-[var(--accent)] text-white'
              : c.isToday
                ? 'ring-1 ring-[var(--accent)] text-text hover:bg-glass-hover'
                : c.inMonth
                  ? 'text-text hover:bg-glass-hover'
                  : 'text-text-muted/50 hover:bg-glass-hover'
          ]"
          :title="c.iso"
          @click="store.choose(c.iso)"
        >
          {{ c.day }}
        </button>
      </div>
      <p class="mt-1.5 text-center text-[9px] text-text-muted">
        {{ $t("insertDate.hint") }}
      </p>
    </div>
  </Teleport>
</template>