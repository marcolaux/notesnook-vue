/**
 * Reminder-editor dialog store (headless) — a small form dialog for creating
 * or editing a reminder, driven by the RemindersView's "New reminder" button
 * and row "Edit" action. Like {@link useColorDialogStore} it is promise-based so
 * the caller can `await` the user's choice, but it returns a
 * {@link ReminderInput} (or `null` on dismiss) instead of `{ title, colorCode }`
 * — the caller then calls `db.reminders.add` (create) / `db.reminders.update`
 * (edit) via the reminders store.
 *
 * Only one dialog is ever open; `confirm`/`cancel` resolve the pending promise.
 * `openCreate` seeds the form with sensible defaults (date = next hour, mode
 * `once`, priority `vibrate`); `openEdit(r)` seeds from the existing reminder
 * and remembers its `id` so `confirm` returns an edit input. Never throws;
 * `cancel`/Esc/outside-click resolve `null`.
 *
 * The store holds raw form state only — the {@link ReminderEditorDialog.vue}
 * component renders + validates it. `confirm` strips fields that do not apply
 * to the chosen `mode` (e.g. `recurringMode`/`selectedDays` only for `repeat`)
 * and keys whose value is `undefined` (so the returned `ReminderInput` is safe
 * under `exactOptionalPropertyTypes` — `buildReminderInput` re-strips before
 * reaching core, but this keeps the shape honest for callers that inspect it).
 */
import { defineStore } from "pinia";
import { ref } from "vue";
import {
  REMINDER_MODES,
  REMINDER_PRIORITIES,
  RECURRING_MODES,
  type ReminderInput
} from "@/utils/reminders";
import type { Reminder } from "@notesnook-vue/contracts";

interface Pending {
  resolve: (result: ReminderInput | null) => void;
}

/** Round a ms timestamp up to the next whole hour (the default for a new
 *  reminder's date so the picker never starts in the past). */
function nextHour(now: number): number {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  return d.getTime() + 60 * 60 * 1000;
}

export const useReminderDialogStore = defineStore("reminderDialog", () => {
  /** Whether the dialog overlay is open. */
  const open = ref(false);
  /** The id being edited, or `null` for a create. */
  const editingId = ref<string | null>(null);
  /** Dialog title ("New reminder" / "Edit reminder"). */
  const mode = ref<"create" | "edit">("create");

  const title = ref("");
  const description = ref("");
  /** Reminder date in ms (epoch). `mode:"permanent"` still requires a date in
   *  core (`db.reminders.add` throws without one), so the field is always
   *  present. */
  const date = ref<number>(nextHour(Date.now()));
  const reminderMode = ref<(typeof REMINDER_MODES)[number]>("once");
  const priority = ref<(typeof REMINDER_PRIORITIES)[number]>("vibrate");
  const recurringMode = ref<(typeof RECURRING_MODES)[number]>("week");
  /** For `recurringMode:"week"` → day-of-week 0–6 (Sun=0, dayjs `.day()`); for
   *  `"month"` → day-of-month 1–31 (dayjs `.date()`). */
  const selectedDays = ref<number[]>([]);
  const localOnly = ref(false);
  const disabled = ref(false);
  /** The note this reminder is being created for (via "Remind me…"), or
   *  `undefined` for a standalone reminder. Not a `Reminder` field — threaded
   *  through `ReminderInput.noteId` so the reminders store can link reminder↔
   *  note. Reset to `undefined` for `openCreate`/`openEdit` (editing preserves
   *  the existing relation via the reminder id; the dialog doesn't re-link). */
  const noteId = ref<string | undefined>(undefined);
  /** The title of `noteId` at open time, shown as a read-only "Linked to note"
   *  hint in the dialog. `undefined` when `noteId` is. */
  const linkedNoteTitle = ref<string | undefined>(undefined);

  /** The active request, or `null` when no dialog is open. */
  let pending: Pending | null = null;

  /** Reset all fields to create-defaults. */
  function resetCreate(): void {
    editingId.value = null;
    mode.value = "create";
    title.value = "";
    description.value = "";
    date.value = nextHour(Date.now());
    reminderMode.value = "once";
    priority.value = "vibrate";
    recurringMode.value = "week";
    selectedDays.value = [];
    localOnly.value = false;
    disabled.value = false;
    noteId.value = undefined;
    linkedNoteTitle.value = undefined;
  }

  /** Seed all fields from an existing reminder for editing. */
  function seedFrom(r: Reminder): void {
    editingId.value = r.id;
    mode.value = "edit";
    title.value = r.title;
    description.value = r.description ?? "";
    date.value = r.date;
    reminderMode.value = (r.mode ?? "once") as (typeof REMINDER_MODES)[number];
    priority.value = (r.priority ?? "vibrate") as (typeof REMINDER_PRIORITIES)[number];
    recurringMode.value = (r.recurringMode ?? "week") as (typeof RECURRING_MODES)[number];
    selectedDays.value = r.selectedDays ? [...r.selectedDays] : [];
    localOnly.value = !!r.localOnly;
    disabled.value = !!r.disabled;
    // Editing a note-linked reminder preserves the existing relation (the
    // reminder id is unchanged); the dialog doesn't re-link.
    noteId.value = undefined;
    linkedNoteTitle.value = undefined;
  }

  /** Open the dialog for a new reminder, returning a promise that resolves
   *  with the user's choice (or `null` if dismissed). Replacing an already-open
   *  dialog resolves it with `null` first (defensive — only one is ever open). */
  function openCreate(): Promise<ReminderInput | null> {
    return new Promise<ReminderInput | null>((resolve) => {
      if (pending) pending.resolve(null);
      resetCreate();
      pending = { resolve };
      open.value = true;
    });
  }

  /** Open the dialog for a new reminder linked to a note ("Remind me…"): seeds
   *  the title with the note's title and the description with the note's
   *  `nn://note/<id>` deep link, and threads `noteId` into the returned
   *  `ReminderInput` so the reminders store can link reminder↔note. The user
   *  can still edit title/description. */
  function openCreateForNote(
    noteIdValue: string,
    noteTitle: string
  ): Promise<ReminderInput | null> {
    return new Promise<ReminderInput | null>((resolve) => {
      if (pending) pending.resolve(null);
      resetCreate();
      title.value = noteTitle;
      description.value = `nn://note/${noteIdValue}`;
      noteId.value = noteIdValue;
      linkedNoteTitle.value = noteTitle;
      pending = { resolve };
      open.value = true;
    });
  }

  /** Open the dialog seeded from `r` for editing. Resolves with the edit input
   *  (carrying `id`) or `null` if dismissed. */
  function openEdit(r: Reminder): Promise<ReminderInput | null> {
    return new Promise<ReminderInput | null>((resolve) => {
      if (pending) pending.resolve(null);
      seedFrom(r);
      pending = { resolve };
      open.value = true;
    });
  }

  /** Build the {@link ReminderInput} from the current form state. Strips
   *  `recurringMode`/`selectedDays` when `mode !== "repeat"` (they are
   *  meaningless for `once`/`permanent`) and omits empty `description`/empty
   *  `selectedDays` (core defaults the latter to `[]`). */
  function buildInput(): ReminderInput {
    const input: ReminderInput = {
      title: title.value.trim(),
      date: date.value,
      mode: reminderMode.value,
      priority: priority.value,
      localOnly: localOnly.value,
      disabled: disabled.value
    };
    if (editingId.value) input.id = editingId.value;
    const desc = description.value.trim();
    if (desc) input.description = desc;
    if (reminderMode.value === "repeat") {
      input.recurringMode = recurringMode.value;
      if (selectedDays.value.length > 0)
        input.selectedDays = [...selectedDays.value];
    }
    if (noteId.value) input.noteId = noteId.value;
    return input;
  }

  /** Confirm: resolve with the built input. Rejects (resolves `null`) when the
   *  title is empty after trim — the caller treats that as a cancel. */
  function confirm(): void {
    const p = pending;
    const input = buildInput();
    pending = null;
    open.value = false;
    if (p) p.resolve(input.title ? input : null);
  }

  /** Cancel: resolve `null` + close. No-op when none is open. */
  function cancel(): void {
    const p = pending;
    pending = null;
    open.value = false;
    if (p) p.resolve(null);
  }

  return {
    open,
    editingId,
    mode,
    title,
    description,
    date,
    reminderMode,
    priority,
    recurringMode,
    selectedDays,
    localOnly,
    disabled,
    noteId,
    linkedNoteTitle,
    openCreate,
    openCreateForNote,
    openEdit,
    setTitle: (v: string) => void (title.value = v),
    setDescription: (v: string) => void (description.value = v),
    setDate: (v: number) => void (date.value = v),
    setReminderMode: (v: (typeof REMINDER_MODES)[number]) => void (reminderMode.value = v),
    setPriority: (v: (typeof REMINDER_PRIORITIES)[number]) => void (priority.value = v),
    setRecurringMode: (v: (typeof RECURRING_MODES)[number]) => void (recurringMode.value = v),
    setSelectedDays: (v: number[]) => void (selectedDays.value = v),
    setLocalOnly: (v: boolean) => void (localOnly.value = v),
    setDisabled: (v: boolean) => void (disabled.value = v),
    confirm,
    cancel
  };
});