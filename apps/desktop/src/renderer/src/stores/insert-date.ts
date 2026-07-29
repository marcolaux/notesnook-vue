/**
 * Insert-date picker store — the backend for the "Date" slash command / "Insert
 * date" palette command. A small date picker popup (today selected; ↑/↓ change
 * the day; Enter inserts) that inserts the chosen date as a local-ISO token +
 * trailing space at the editor's cursor, so the `daily-note-bridge` auto-linker
 * wraps it in an `nn://note/<id>` link to that date's daily note (creating it if
 * missing) — the same mechanic as `insertTodayDateLink`.
 *
 * Headless: owns only the open/close + selected-date + target-editor state + the
 * insert action. The popup component (`DatePickerPopup.vue`) reads this; the
 * `use-insert-date` composable opens it positioned at the editor's cursor. The
 * store is editor-aware (it calls `editor.chain().focus().insertContent`) but
 * holds no DOM — `coordsAtPos` is computed by the composable, not here.
 */
import { defineStore } from "pinia";
import { ref } from "vue";
import type { Editor } from "@tiptap/vue-3";
import { addDays, isoDate, parseIsoDate, todayIso } from "@/utils/daily-notes";
import { logger } from "@/utils/logger";

export const useInsertDateStore = defineStore("insert-date", () => {
  /** Whether the picker popup is open. */
  const open = ref(false);
  /** The editor to insert into on confirm (null when closed). */
  const editor = ref<Editor | null>(null);
  /** Desired popup top-left (the composable fills this from the cursor coords;
   *  the popup clamps into the viewport itself). */
  const x = ref(0);
  const y = ref(0);
  /** The currently-selected ISO date (`YYYY-MM-DD`, local). Today on open. */
  const selected = ref<string>(todayIso());

  /** Open the picker for `editor` at `(px, py)`, with today selected. */
  function openFor(ed: Editor, px: number, py: number): void {
    editor.value = ed;
    selected.value = todayIso();
    x.value = px;
    y.value = py;
    open.value = true;
  }

  /** Close without inserting. */
  function close(): void {
    open.value = false;
    editor.value = null;
  }

  /** Shift the selected date by `n` days (used by the calendar grid's arrow
   *  keys: ←/→ = ±1, ↑/↓ = ±7). No-op when closed. */
  function shiftDays(n: number): void {
    if (!open.value) return;
    const d = parseIsoDate(selected.value);
    if (!d) return;
    selected.value = isoDate(addDays(d, n));
  }

  /** Shift the selected date by `n` months, clamping the day to the target
   *  month's length (e.g. Jan 31 + 1 month → Feb 28/29). PageUp/PageDown. */
  function shiftMonths(n: number): void {
    if (!open.value) return;
    const d = parseIsoDate(selected.value);
    if (!d) return;
    const y = d.getFullYear();
    const m = d.getMonth() + n;
    const ny = y + Math.floor(m / 12);
    const nm = ((m % 12) + 12) % 12;
    const day = Math.min(d.getDate(), new Date(ny, nm + 1, 0).getDate());
    selected.value = isoDate(new Date(ny, nm, day));
  }

  /** Move the selection to the first day of the currently-selected month. Home. */
  function goToMonthStart(): void {
    if (!open.value) return;
    const d = parseIsoDate(selected.value);
    if (!d) return;
    selected.value = isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  /** Move the selection to the last day of the currently-selected month. End. */
  function goToMonthEnd(): void {
    if (!open.value) return;
    const d = parseIsoDate(selected.value);
    if (!d) return;
    selected.value = isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }

  /** Set the selected date to `iso` and insert it immediately (a calendar day
   *  click). No-op when closed. */
  function choose(iso: string): void {
    if (!open.value) return;
    selected.value = iso;
    confirm();
  }

  /** Insert the selected date (local-ISO + trailing space) into the editor at
   *  the cursor and close. The trailing space makes the date a complete token
   *  so the daily-note-bridge auto-links it. Never throws. */
  function confirm(): void {
    const ed = editor.value;
    const iso = selected.value;
    close();
    if (!ed || ed.isDestroyed) return;
    try {
      ed.chain().focus().insertContent(`${iso} `).run();
    } catch (e) {
      logger.error("[insert-date] confirm failed:", e);
    }
  }

  return {
    open,
    editor,
    x,
    y,
    selected,
    openFor,
    close,
    shiftDays,
    shiftMonths,
    goToMonthStart,
    goToMonthEnd,
    choose,
    confirm
  };
});