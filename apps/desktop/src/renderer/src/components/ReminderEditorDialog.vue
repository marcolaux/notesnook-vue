<!--
  Reminder-editor dialog overlay — the visual surface for
  `useReminderDialogStore.openCreate()` / `openEdit(reminder)`, opened by the
  RemindersView's "New reminder" button + row "Edit" action. A single instance
  is mounted in `App.vue`; the store's form state drives the content. Theme-
  consistent with `ColorEditorDialog.vue` / `ConfirmDialog.vue` (glass surface).

  Fields: title (required), description, a `datetime-local` date picker
  (kept in sync with the store's ms `date`), mode (once / repeat / permanent),
  priority (silent / vibrate / urgent). When `mode === "repeat"`, a recurringMode
  picker (day / week / month / year) + a per-mode day selector (week →
  Sun–Sat checkboxes; month → a day-of-month number; day/year → none). Plus
  localOnly + disabled checkboxes. Create/Save → resolves the pending promise
  with a `ReminderInput` (empty title after trim resolves `null`); Esc /
  outside-click / Cancel → `null`.

  Labels are English literals (the codebase is mid-i18n — TrashView hardcodes
  the same way; migrating these is the Phase 7.1 sweep).
-->
<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from "vue";
import { useReminderDialogStore } from "@/stores/reminder-dialog";
import {
  REMINDER_MODES,
  REMINDER_PRIORITIES,
  RECURRING_MODES
} from "@/utils/reminders";

const dialog = useReminderDialogStore();

const titleInput = ref<HTMLInputElement | null>(null);

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Format a ms epoch as the local `YYYY-MM-DDTHH:mm` string a
 *  `datetime-local` input expects (no timezone — local). */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse a `datetime-local` string back to ms. `new Date("YYYY-MM-DDTHH:mm")`
 *  (no `Z`) is parsed as local time, so this round-trips with `toLocalInput`. */
function fromLocalInput(s: string): number {
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? dialog.date : t;
}

function onKeydown(e: KeyboardEvent): void {
  if (!dialog.open) return;
  if (e.key === "Escape") {
    e.preventDefault();
    dialog.cancel();
  } else if (e.key === "Enter" && (e.target as HTMLElement)?.tagName !== "TEXTAREA") {
    e.preventDefault();
    dialog.confirm();
  }
}

function onDown(e: MouseEvent): void {
  if (e.target === e.currentTarget) dialog.cancel();
}

function onTitle(e: Event): void {
  dialog.setTitle((e.target as HTMLInputElement).value);
}
function onDescription(e: Event): void {
  dialog.setDescription((e.target as HTMLTextAreaElement).value);
}
function onDate(e: Event): void {
  dialog.setDate(fromLocalInput((e.target as HTMLInputElement).value));
}
function onMode(e: Event): void {
  dialog.setReminderMode((e.target as HTMLSelectElement).value as (typeof REMINDER_MODES)[number]);
}
function onPriority(e: Event): void {
  dialog.setPriority((e.target as HTMLSelectElement).value as (typeof REMINDER_PRIORITIES)[number]);
}
function onRecurring(e: Event): void {
  dialog.setRecurringMode((e.target as HTMLSelectElement).value as (typeof RECURRING_MODES)[number]);
}
function onLocalOnly(e: Event): void {
  dialog.setLocalOnly((e.target as HTMLInputElement).checked);
}
function onDisabled(e: Event): void {
  dialog.setDisabled((e.target as HTMLInputElement).checked);
}

/** Toggle a day-of-week (0–6) in `selectedDays` (used by `week`). */
function toggleWeekday(day: number): void {
  const cur = dialog.selectedDays;
  dialog.setSelectedDays(
    cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort((a, b) => a - b)
  );
}

/** Day-of-month for `month` recurrence: read/write a single value via a number
 *  input (1–31). */
const monthDay = ref<number>(1);
function syncMonthDay(): void {
  monthDay.value = dialog.selectedDays[0] ?? new Date(dialog.date).getDate();
}
function onMonthDay(e: Event): void {
  const n = Math.max(1, Math.min(31, Number((e.target as HTMLInputElement).value) || 1));
  monthDay.value = n;
  dialog.setSelectedDays([n]);
}

// Focus the title field on open + bind the window keydown listener; also sync
// the month-day input whenever the dialog opens or recurrence switches to month.
watch(
  () => dialog.open,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener("keydown", onKeydown);
      void nextTick(() => titleInput.value?.focus());
      syncMonthDay();
    } else {
      window.removeEventListener("keydown", onKeydown);
    }
  }
);
watch(
  () => dialog.recurringMode,
  (m) => {
    if (m === "month") syncMonthDay();
  }
);

onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="dialog.open" class="rmd__backdrop" @mousedown="onDown">
      <div class="rmd__panel" @mousedown.stop>
        <div class="rmd__title">{{ dialog.mode === "edit" ? "Edit reminder" : "New reminder" }}</div>

        <label class="rmd__field">
          <span class="rmd__label">Title</span>
          <input
            ref="titleInput"
            class="rmd__input"
            type="text"
            placeholder="Reminder title"
            :value="dialog.title"
            @input="onTitle"
          />
        </label>

        <div v-if="dialog.linkedNoteTitle" class="rmd__hint rmd__linked">
          Linked to note: {{ dialog.linkedNoteTitle }}
        </div>

        <label class="rmd__field">
          <span class="rmd__label">Description</span>
          <textarea
            class="rmd__input rmd__textarea"
            rows="2"
            placeholder="Optional notes"
            :value="dialog.description"
            @input="onDescription"
          />
        </label>

        <label class="rmd__field">
          <span class="rmd__label">{{ dialog.reminderMode === "permanent" ? "Starts" : "Date & time" }}</span>
          <input
            class="rmd__input"
            type="datetime-local"
            :value="toLocalInput(dialog.date)"
            @input="onDate"
          />
        </label>

        <div class="rmd__row">
          <label class="rmd__field rmd__field--inline">
            <span class="rmd__label">Mode</span>
            <select class="rmd__input rmd__select" :value="dialog.reminderMode" @change="onMode">
              <option v-for="m in REMINDER_MODES" :key="m" :value="m">{{ m }}</option>
            </select>
          </label>
          <label class="rmd__field rmd__field--inline">
            <span class="rmd__label">Priority</span>
            <select class="rmd__input rmd__select" :value="dialog.priority" @change="onPriority">
              <option v-for="p in REMINDER_PRIORITIES" :key="p" :value="p">{{ p }}</option>
            </select>
          </label>
        </div>

        <template v-if="dialog.reminderMode === 'repeat'">
          <label class="rmd__field">
            <span class="rmd__label">Repeats</span>
            <select class="rmd__input rmd__select" :value="dialog.recurringMode" @change="onRecurring">
              <option v-for="r in RECURRING_MODES" :key="r" :value="r">{{ r }}</option>
            </select>
          </label>

          <div v-if="dialog.recurringMode === 'week'" class="rmd__field">
            <span class="rmd__label">On days</span>
            <div class="rmd__weekdays">
              <button
                v-for="(d, i) in WEEKDAYS"
                :key="i"
                type="button"
                class="rmd__weekday"
                :class="{ 'rmd__weekday--on': dialog.selectedDays.includes(i) }"
                @click="toggleWeekday(i)"
              >{{ d }}</button>
            </div>
          </div>

          <label v-if="dialog.recurringMode === 'month'" class="rmd__field">
            <span class="rmd__label">Day of month</span>
            <input
              class="rmd__input"
              type="number"
              min="1"
              max="31"
              :value="monthDay"
              @input="onMonthDay"
            />
          </label>

          <div v-if="dialog.recurringMode === 'day'" class="rmd__hint">Every day at the chosen time.</div>
          <div v-if="dialog.recurringMode === 'year'" class="rmd__hint">Yearly on this date & time.</div>
        </template>

        <div class="rmd__checks">
          <label class="rmd__check">
            <input type="checkbox" :checked="dialog.localOnly" @change="onLocalOnly" />
            <span>Local only (don't sync)</span>
          </label>
          <label class="rmd__check">
            <input type="checkbox" :checked="dialog.disabled" @change="onDisabled" />
            <span>Disabled</span>
          </label>
        </div>

        <div class="rmd__actions">
          <button class="rmd__btn rmd__btn--cancel" @click="dialog.cancel">Cancel</button>
          <button class="rmd__btn rmd__btn--confirm" @click="dialog.confirm">
            {{ dialog.mode === "edit" ? "Save" : "Create" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.rmd__backdrop {
  position: fixed;
  inset: 0;
  z-index: 82;
  display: grid;
  place-items: center;
  background: var(--color-backdrop, color-mix(in srgb, black 40%, transparent));
  backdrop-filter: blur(2px);
}
.rmd__panel {
  width: min(380px, 92vw);
  max-height: 88vh;
  overflow-y: auto;
  padding: 18px 18px 14px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-solid);
  backdrop-filter: blur(var(--backdrop-blur-base, 24px));
  box-shadow: 0 12px 40px color-mix(in srgb, black 50%, transparent);
  color: var(--color-text);
  font-size: 13px;
}
.rmd__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-heading, #fff);
  margin-bottom: 12px;
}
.rmd__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}
.rmd__field--inline {
  flex: 1 1 0;
}
.rmd__row {
  display: flex;
  gap: 8px;
}
.rmd__label {
  font-size: 11px;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
}
.rmd__input {
  padding: 6px 8px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  border-radius: 6px;
  background: var(--color-surface-solid, rgba(0, 0, 0, 0.3));
  color: inherit;
  font: inherit;
  outline: none;
}
.rmd__input:focus {
  border-color: var(--color-accent, rgba(255, 255, 255, 0.35));
}
.rmd__textarea {
  resize: vertical;
  min-height: 44px;
}
.rmd__select {
  cursor: pointer;
}
.rmd__weekdays {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.rmd__weekday {
  padding: 4px 8px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.rmd__weekday--on {
  background: var(--color-primary, rgba(255, 255, 255, 0.16));
  color: var(--color-heading, #fff);
  border-color: var(--color-accent, rgba(255, 255, 255, 0.35));
}
.rmd__hint {
  font-size: 11px;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
  margin-bottom: 12px;
}
.rmd__checks {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}
.rmd__check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
}
.rmd__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.rmd__btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  background: transparent;
  color: var(--color-text, rgba(255, 255, 255, 0.85));
  font: inherit;
  cursor: pointer;
}
.rmd__btn:hover {
  background: var(--color-hover, rgba(255, 255, 255, 0.08));
}
.rmd__btn--confirm {
  background: var(--color-primary, rgba(255, 255, 255, 0.16));
  color: var(--color-heading, #fff);
}
</style>