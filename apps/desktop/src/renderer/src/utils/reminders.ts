/**
 * Pure reminders logic — helpers for the reminders store that lists / creates /
 * edits / deletes reminders via `db.reminders` (`@notesnook/core`). Kept
 * framework-agnostic so it is unit-tested in isolation
 * (see `tests/contract/reminders.spec.ts`). `useRemindersStore` composes these.
 *
 * A `Reminder` is a top-level Core collection item (the "reminders" grouping),
 * not attached to a note: it has a `title`, `description`, a `date`, a `mode`
 * (`once` | `repeat` | `permanent`), a `priority`, and (for `repeat`) a
 * `recurringMode` + `selectedDays`. `db.reminders.add` upserts (merges the
 * stored row by id) and already defaults `mode:"once"`, `priority:"vibrate"`,
 * `selectedDays:[]` — so this util does **not** re-apply those defaults (DRY:
 * core owns them); its only job is to build an `exactOptionalPropertyTypes`-safe
 * `Partial<Reminder>` by stripping `undefined` keys before they reach core.
 */

import type { Reminder } from "@notesnook-vue/contracts";
import { isReminderActive, getUpcomingReminderTime } from "@notesnook-vue/contracts";

/** Reminder priorities, in the order the picker UI will list them. */
export const REMINDER_PRIORITIES = ["silent", "vibrate", "urgent"] as const;
export type ReminderPriority = (typeof REMINDER_PRIORITIES)[number];

/** Reminder modes — `once` fires at `date` and is done, `repeat` recurs per
 *  `recurringMode`/`selectedDays`, `permanent` is ongoing (no fire time). */
export const REMINDER_MODES = ["repeat", "once", "permanent"] as const;
export type ReminderMode = (typeof REMINDER_MODES)[number];

/** Recurrence units for `mode:"repeat"`. */
export const RECURRING_MODES = ["week", "month", "day", "year"] as const;
export type RecurringMode = (typeof RECURRING_MODES)[number];

/**
 * Input for creating or editing a reminder via `db.reminders.add`. All fields
 * optional: on create only `title` + `date` are required (core throws
 * otherwise); on edit, `id` plus the changed fields.
 *
 * `noteId` is NOT a `Reminder` field (reminders are a standalone top-level
 * collection) — it is stripped by `buildReminderInput` and consumed by the
 * reminders store, which links reminder↔note via `db.relations.add` after the
 * `db.reminders.add` returns the new id. Carried here so the editor dialog can
 * thread it through the create flow in one shape.
 */
export interface ReminderInput {
  id?: string;
  title?: string;
  description?: string;
  date?: number;
  mode?: ReminderMode;
  priority?: ReminderPriority;
  recurringMode?: RecurringMode;
  selectedDays?: number[];
  localOnly?: boolean;
  disabled?: boolean;
  snoozeUntil?: number;
  /** Optional note to link the new reminder to (reminder↔note relation). The
   *  store consumes this; `buildReminderInput` strips it before core sees it. */
  noteId?: string;
}

/**
 * Normalize a {@link ReminderInput} into an `exactOptionalPropertyTypes`-safe
 * `Partial<Reminder>` for `db.reminders.add`: returns a fresh object carrying
 * only the keys whose value is not `undefined` (so core's `upsert` never
 * receives an explicit `undefined` for an optional column). Applies no defaults
 * — core's `add` already defaults `mode`/`priority`/`selectedDays`. Used both for
 * creates (no `id`) and edits (`{ id, …patch }`, since `add` upserts by id).
 */
export function buildReminderInput(input: ReminderInput): Partial<Reminder> {
  const out: Partial<Reminder> = {};
  if (input.id !== undefined) out.id = input.id;
  if (input.title !== undefined) out.title = input.title;
  if (input.description !== undefined) out.description = input.description;
  if (input.date !== undefined) out.date = input.date;
  if (input.mode !== undefined) out.mode = input.mode;
  if (input.priority !== undefined) out.priority = input.priority;
  if (input.recurringMode !== undefined) out.recurringMode = input.recurringMode;
  if (input.selectedDays !== undefined) out.selectedDays = input.selectedDays;
  if (input.localOnly !== undefined) out.localOnly = input.localOnly;
  if (input.disabled !== undefined) out.disabled = input.disabled;
  if (input.snoozeUntil !== undefined) out.snoozeUntil = input.snoozeUntil;
  return out;
}

/**
 * Sort reminders newest-created-first by `dateCreated` (a stable, non-mutating
 * default order for the list). The on-site view re-sorts by upcoming fire time
 * (core's `getUpcomingReminderTime` is dayjs-heavy + not re-exported, so the
 * real upcoming-order is a view concern, not re-implemented here).
 */
export function sortRemindersByCreatedDesc(
  reminders: readonly Reminder[]
): Reminder[] {
  return [...reminders].sort((a, b) => b.dateCreated - a.dateCreated);
}

/**
 * A reminder the renderer pushes to the main-process scheduler so main can
 * `setTimeout` + fire an OS `Notification` at `fireAt`. `description` is
 * optional (core allows it to be undefined); omitted here when absent so the
 * tRPC input's `exactOptionalPropertyTypes` is satisfied.
 */
export interface ScheduledReminder {
  id: string;
  title: string;
  description?: string;
  /** Optional note id linked to this reminder (via `db.relations`). When
   *  present, the main-process notification `click` handler sends
   *  `app:open-note` with this id so clicking the notification opens the note.
   *  `undefined` is allowed (a standalone reminder has no link); included for
   *  `exactOptionalPropertyTypes` compat with the zod-inferred bridge input. */
  noteId?: string | undefined;
  fireAt: number;
}

/**
 * Compute the schedule for OS notifications: one entry per *active* reminder
 * carrying its next fire timestamp. Pure + framework-agnostic so it is unit-
 * tested in isolation (see `tests/contract/reminders.spec.ts`); the
 * `useReminderNotifications` composable passes `Date.now()` and pushes the
 * result to `desktop.reminders.schedule`.
 *
 * Rules:
 *  - `mode: "permanent"` is excluded entirely — it is an ongoing reminder with
 *    no fire time (`getUpcomingReminderTime` is undefined for it); core's
 *    `formatReminderTime` likewise returns `"Ongoing"`.
 *  - A snoozed reminder (`snoozeUntil > now`) fires at `snoozeUntil` (snooze
 *    overrides the recurrence); otherwise `once` fires at `reminder.date` and
 *    `repeat` fires at `getUpcomingReminderTime(reminder)` (next occurrence).
 *  - Entries with `fireAt <= now` are dropped — they're already past. Letting
 *    them through would fire a stale notification on boot; the next
 *    `refresh()` re-evaluates and (for `repeat`) recomputes the next future
 *    occurrence, so the item re-enters the schedule then.
 */
export function buildReminderSchedule(
  reminders: readonly Reminder[],
  now: number,
  noteLinks?: Readonly<Record<string, string>>
): ScheduledReminder[] {
  const out: ScheduledReminder[] = [];
  for (const r of reminders) {
    if (r.mode === "permanent") continue;
    if (!isReminderActive(r)) continue;
    const fireAt =
      r.snoozeUntil && r.snoozeUntil > now
        ? r.snoozeUntil
        : getUpcomingReminderTime(r);
    if (!fireAt || fireAt <= now) continue;
    const entry: ScheduledReminder = { id: r.id, title: r.title, fireAt };
    if (r.description !== undefined) entry.description = r.description;
    const noteId = noteLinks?.[r.id];
    if (noteId !== undefined) entry.noteId = noteId;
    out.push(entry);
  }
  return out;
}

/**
 * Sort reminders by next fire time (soonest first), inactive ones last. A view
 * concern (the list ordering) — `permanent` reminders (no fire time) sort to
 * the inactive tail by giving them `Infinity`. Uses the same
 * `getUpcomingReminderTime`/`date` logic as `buildReminderSchedule`.
 */
export function sortRemindersByUpcoming(
  reminders: readonly Reminder[],
  now: number
): Reminder[] {
  return [...reminders].sort((a, b) => {
    const ta = fireTimeOrInfinity(a, now);
    const tb = fireTimeOrInfinity(b, now);
    return ta - tb;
  });
}

function fireTimeOrInfinity(r: Reminder, now: number): number {
  if (r.mode === "permanent") return Number.POSITIVE_INFINITY;
  if (!isReminderActive(r)) return Number.POSITIVE_INFINITY;
  if (r.snoozeUntil && r.snoozeUntil > now) return r.snoozeUntil;
  return getUpcomingReminderTime(r);
}