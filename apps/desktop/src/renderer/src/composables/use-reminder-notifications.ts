/**
 * Reminder-notification scheduling (renderer side of the main-process
 * scheduler). Watches the reminders store's `items` and pushes the computed
 * schedule to main (`desktop.reminders.schedule`) so main can `setTimeout` +
 * fire an OS `Notification` at each reminder's next fire time. When main fires
 * a notification it signals back over `app:reminder-fired`; this composable
 * listens + calls `reminders.refresh()`, which re-runs the watch → re-pushes
 * (a fired once-reminder drops out of active; a repeat reminder reschedules to
 * its next occurrence via `getUpcomingReminderTime`).
 *
 * Repush is DEBOUNCED (~150ms): a single user action (edit, snooze, toggle)
 * triggers a db write + a `refresh()`, and a fired reminder triggers an
 * `app:reminder-fired` → `refresh()` too — without debounce, two refreshes
 * landing close together race their `schedule` calls on main, and a stale
 * (empty) schedule landing last would wipe the fresh one. Debounce coalesces
 * them so the LATEST items always win. The push is also ATOMIC: a single
 * `schedule.mutate(items)` call makes main clear-all + re-arm in one go (no
 * window where timers are absent between a `clear` and an `arm`).
 *
 * The pure fire-time computation lives in `buildReminderSchedule`
 * (`utils/reminders.ts`) so it is unit-tested in isolation; this composable
 * only wires it to the store + the bridge.
 *
 * Mounted in the MAIN window only (top-level in `App.vue`, guarded). Headless-
 * safe: any main-bridge / preload absence (e.g. contract tests) is caught and
 * silently no-ops.
 */
import { watch, onUnmounted } from "vue";
import { desktop } from "@/platform/desktop-bridge";
import { useRemindersStore } from "@/stores/reminders";
import { buildReminderSchedule } from "@/utils/reminders";

/** Debounce window for coalescing rapid `items` changes into one schedule push. */
const REPUSH_DEBOUNCE_MS = 150;

/** Wire reminder scheduling to the store. Call once per main-window mount. */
export function useReminderNotifications(): void {
  const reminders = useRemindersStore();
  let pending: ReturnType<typeof setTimeout> | null = null;

  /** Re-push the full schedule: main clears all timers + re-arms from the
   *  active reminders' next fire times, in one atomic call. Best-effort — a
   *  main-bridge failure (tests) is caught and silently ignored. Computes the
   *  schedule from the LATEST store state at call time (after the debounce). */
  async function repush(): Promise<void> {
    try {
      const items = buildReminderSchedule(
        reminders.items,
        Date.now(),
        reminders.noteIdMap
      );
      // Atomic: main's `schedule` clears all timers then arms from `items`.
      // Empty list = clear-all + arm nothing.
      await desktop.reminders.schedule.mutate(items);
      // eslint-disable-next-line no-console
      console.info(
        `[reminders] scheduled ${items.length} reminder(s): ` +
          items.map((i) => `${i.title}@${new Date(i.fireAt).toLocaleTimeString()}`).join(", ")
      );
    } catch {
      // main unreachable (e.g. tests) — no-op.
    }
  }

  /** Coalesce rapid `items` changes into a single repush using the latest
   *  state. Cancels any pending repush so a stale (pre-edit) snapshot can't
   *  overwrite a fresh one. */
  function scheduleRepush(): void {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      void repush();
    }, REPUSH_DEBOUNCE_MS);
  }

  // Re-push whenever the store's items change (refresh, sync, context switch,
  // create/edit/delete/fire). `items.value` is reassigned on each refresh so a
  // shallow watch on the array ref fires.
  const stopWatch = watch(() => reminders.items, scheduleRepush);

  // Main fired a notification → refresh so repeats reschedule + once-reminders
  // drop out of active (the resulting `items` change re-runs `repush`).
  let offFired: (() => void) | undefined;
  if (typeof window !== "undefined" && window.appEvents) {
    offFired = window.appEvents.onReminderFired(() => {
      void reminders.refresh();
    });
  }

  onUnmounted(() => {
    stopWatch();
    offFired?.();
    if (pending) clearTimeout(pending);
    // Drop the schedule when the composable tears down (app quitting) so no
    // late notification fires. Best-effort.
    void desktop.reminders.clear.mutate().catch(() => {
      /* main gone — no-op */
    });
  });
}