/**
 * Main-process reminders server — implements the {@link RemindersServer}
 * contract and registers it with the tRPC bridge. Backs the OS-notification
 * scheduling for reminders: the renderer computes each reminder's next fire
 * time (core's `getUpcomingReminderTime`, via the pure `buildReminderSchedule`)
 * and pushes the schedule here; main sets a `setTimeout` per item, fires an
 * Electron `Notification` when it elapses, and signals the renderer over
 * `app:reminder-fired` so it can reschedule repeats / drop fired
 * once-reminders.
 *
 * Long-horizon timers: `setTimeout` delays are 32-bit signed ints (max
 * ~24.8 days); a delay beyond that would fire immediately (overflow). To stay
 * correct for a reminder weeks/months out, the timer is armed via a recursive
 * intermediate that re-evaluates at the cap until the real `fireAt` is within
 * range — see {@link armTimer}.
 *
 * Electron + node only; not contract-tested (the renderer reaches it via the
 * typed `desktop.reminders.*` bridge — see `src/main/shell.ts` for the same
 * rationale).
 */
import { app, BrowserWindow, Notification } from "electron";
import {
  registerRemindersServer,
  type RemindersServer,
  type ScheduledReminder
} from "../contracts/router";

/** Max safe `setTimeout` delay (just under 2^31-1 ms ≈ 24.8 days). Delays beyond
 *  this are armed via a recursive intermediate so they don't overflow to 1ms. */
const MAX_TIMEOUT = 2_147_483_000;

/** Create the RemindersServer impl bound to `window` (used to send
 *  `app:reminder-fired` back to the renderer). */
export function createRemindersServer(window: BrowserWindow): RemindersServer {
  /** Active timers keyed by reminder id (the real timer OR a recursive
   *  intermediate). */
  const timers = new Map<string, NodeJS.Timeout>();

  /** Outstanding `Notification` instances retained so the GC doesn't collect
   *  them before the OS presents the banner AND so the `click` listener is
   *  still attached when the user clicks — a known Electron/macOS gotcha where
   *  a notification created + `show()`-ed + immediately dropped can fail to
   *  appear (the first often survives by luck; a rapid second does not), and
   *  releasing on `show` could collect it before the (later) `click` fires.
   *  Released on `close`/`failed`, or after a 60s fallback (e.g. DND-suppressed
   *  notifications that never `close`). */
  const pendingNotifications = new Set<Electron.Notification>();

  function clearAll(): void {
    for (const handle of timers.values()) clearTimeout(handle);
    timers.clear();
  }

  function fireNow(entry: ScheduledReminder): void {
    timers.delete(entry.id);
    if (Notification.isSupported()) {
      const opts: Electron.NotificationConstructorOptions = { title: entry.title };
      if (entry.description) opts.body = entry.description;
      try {
        const n = new Notification(opts);
        pendingNotifications.add(n);
        // Release the ref once the user has dismissed it (`close`) or it failed
        // — NOT on `show`, so the instance survives until a later `click`. The
        // 60s fallback covers DND-suppressed notifications that never `close`.
        const release = (): void => {
          pendingNotifications.delete(n);
        };
        n.once("close", release);
        n.once("failed", release);
        setTimeout(release, 60_000);
        // Click → focus the window + open the linked note (if any). Reuses the
        // existing `app:open-note` deep-link path (preload `onOpenNote` +
        // `App.vue`'s `openNoteFromDeepLink` → `selectNote`).
        n.once("click", () => {
          if (window.isDestroyed()) return;
          if (window.isMinimized()) window.restore();
          window.show();
          window.focus();
          if (entry.noteId) {
            try {
              window.webContents.send("app:open-note", entry.noteId);
            } catch {
              /* webContents gone — no-op */
            }
          }
        });
        n.show();
        // eslint-disable-next-line no-console
        console.info(`[reminders] fired notification "${entry.title}"`);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[reminders] notification show failed:", e);
      }
    }
    if (!window.isDestroyed()) {
      try {
        window.webContents.send("app:reminder-fired", entry.id);
      } catch {
        /* webContents gone — no-op */
      }
    }
  }

  /** Arm a timer for `entry` firing at `fireAt`. Recurses via an intermediate
   *  when the delay exceeds {@link MAX_TIMEOUT} so very-far-out reminders don't
   *  overflow to an immediate fire. */
  function armTimer(entry: ScheduledReminder, fireAt: number): void {
    const delay = fireAt - Date.now();
    if (delay <= 0) {
      fireNow(entry);
      return;
    }
    if (delay <= MAX_TIMEOUT) {
      timers.set(
        entry.id,
        setTimeout(() => fireNow(entry), delay)
      );
    } else {
      // Re-evaluate at the cap; the real fireAt is still far away.
      timers.set(
        entry.id,
        setTimeout(() => armTimer(entry, fireAt), MAX_TIMEOUT)
      );
    }
  }

  return {
    async schedule(items: ScheduledReminder[]): Promise<void> {
      clearAll();
      for (const item of items) {
        const delay = item.fireAt - Date.now();
        if (delay <= 0) continue; // stale — skip (renderer will re-push on refresh)
        armTimer(item, item.fireAt);
      }
      // eslint-disable-next-line no-console
      console.info(
        `[reminders] main schedule: ${timers.size} armed (` +
          `${items.length} received, ${items.length - timers.size} stale/skipped)`
      );
    },
    async clear(): Promise<void> {
      clearAll();
    }
  };
}

/** Register the reminders server with the tRPC bridge + clear timers on quit.
 *  Call once on main boot, after the main window exists (it is used to send
 *  `app:reminder-fired` back to the renderer). */
export function registerReminders(window: BrowserWindow): void {
  const server = createRemindersServer(window);
  registerRemindersServer(server);
  // Clear all timers on quit so no late notification fires during shutdown.
  app.on("before-quit", () => void server.clear());
}