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