/**
 * Main-process notifications server — implements the {@link NotificationsServer}
 * contract and registers it with the tRPC bridge. Shows one-shot OS
 * notifications (e.g. the auto-backup scheduler announcing a completed backup).
 *
 * Distinct from `reminders.ts` (which SCHEDULES notifications via `setTimeout`
 * for the reminders feature): this is an immediate `show()`. Reuses the same
 * Electron `Notification` + GC-safe retention pattern — a notification created
 * + `show()`-ed + immediately dropped can fail to appear (a known Electron/macOS
 * gotcha), so each instance is retained until `close`/`failed` or a 60s fallback
 * (covers DND-suppressed notifications that never `close`). Click focuses the
 * main window.
 *
 * Electron + node only; not contract-tested (the renderer reaches it via the
 * typed `desktop.notifications.*` bridge — see `src/main/reminders.ts` for the
 * same rationale).
 */
import { BrowserWindow, Notification } from "electron";
import { registerNotificationsServer, type NotificationsServer } from "../contracts/router";

/** Create the NotificationsServer impl bound to `window` (focused on click). */
export function createNotificationsServer(window: BrowserWindow): NotificationsServer {
  /** Outstanding `Notification` instances retained so the GC doesn't collect
   *  them before the OS presents the banner. Released on `close`/`failed` or
   *  after a 60s fallback (DND-suppressed notifications that never `close`). */
  const pending = new Set<Electron.Notification>();

  return {
    async show({ title, body }): Promise<void> {
      if (!Notification.isSupported()) return;
      try {
        const opts: Electron.NotificationConstructorOptions = { title };
        if (body) opts.body = body;
        const n = new Notification(opts);
        pending.add(n);
        const release = (): void => {
          pending.delete(n);
        };
        n.once("close", release);
        n.once("failed", release);
        setTimeout(release, 60_000);
        n.once("click", () => {
          if (window.isDestroyed()) return;
          if (window.isMinimized()) window.restore();
          window.show();
          window.focus();
        });
        n.show();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[notifications] show failed:", e);
      }
    }
  };
}

/** Register the notifications server with the tRPC bridge. Call once on main
 *  boot. `window` is the main window (focused when the user clicks a banner). */
export function registerNotifications(window: BrowserWindow): void {
  registerNotificationsServer(createNotificationsServer(window));
}