import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { desktop } from "@/platform/desktop-bridge";
import {
  isUpdateAvailable,
  isReadyToInstall,
  updateStatusText,
  type UpdatePhase
} from "@/utils/updater";
import type { UpdateStatus } from "@contracts/router";

/**
 * Updater store (Phase 6.2 — headless control slice) — the reactive surface
 * for the main-process auto-updater (`electron-updater`), reached over the
 * tRPC bridge as `desktop.updater.*`.
 *
 * Design (mirrors `stores/sync.ts` / `stores/vault.ts` / `stores/backup.ts`):
 *  - **Never throws.** Every action catches, sets `lastError`, logs, and
 *    returns `boolean` success (state left intact on failure).
 *  - **Dev is a no-op.** The main impl short-circuits to an idle status when
 *    `!app.isPackaged`, so `checkForUpdates()` resolves with "up to date"
 *    without any network. Live update verification is an on-site / release
 *    gate (needs a published, signed build + network).
 *
 * The store keeps the last known {@link UpdateStatus} snapshot; computeds
 * derive the phase + button gates from it via the pure helpers in
 * `utils/updater.ts`. `init()` (called once at boot from `App.vue`) subscribes
 * to the `updater:status` IPC event so live download progress + "ready to
 * install" state flow in without polling, and kicks an automatic update check
 * (10s after boot, then every 4h) so a continuous-channel update surfaces as a
 * title-bar badge without user action. Auto-download stays off — the user
 * chooses when to download/install.
 */
// `init()`-owned handles, kept module-level so init is idempotent across
// hot-reloads / multiple component mounts (only the first call wires them).
let initialized = false;
let ipcUnsub: (() => void) | undefined;
let checkTimer: ReturnType<typeof setTimeout> | undefined;
let checkInterval: ReturnType<typeof setInterval> | undefined;
const AUTO_CHECK_DELAY_MS = 10_000;
const AUTO_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4h

export const useUpdaterStore = defineStore("updater", () => {
  /** A `check` / `download` / `install` call is in flight. */
  const busy = ref(false);
  /** Last known status snapshot from the main impl. */
  const status = ref<UpdateStatus>({ available: false, version: null, downloaded: false, progress: 0 });
  const lastError = ref<string | null>(null);

  /** Coarse phase derived from the snapshot (pure helper). */
  const phase = computed<UpdatePhase>(() => {
    // Re-derive locally to keep the computed reactive on `status`.
    const s = status.value;
    if (s.downloaded) return "ready";
    if (s.progress > 0 && s.progress < 100) return "downloading";
    if (s.available) return "available";
    if (s.version === null) return "unknown";
    return "up-to-date";
  });

  /** An update is available but not yet downloaded. */
  const updateAvailable = computed(() => isUpdateAvailable(status.value));
  /** A downloaded update is waiting to be installed. */
  const readyToInstall = computed(() => isReadyToInstall(status.value));
  /** User-facing label for the current snapshot. */
  const statusText = computed(() => updateStatusText(status.value));

  function clearError(): void {
    lastError.value = null;
  }

  function applyStatus(next: UpdateStatus): void {
    status.value = next;
  }

  /** Wire the live-progress IPC subscription + the automatic update check.
   *  Idempotent — safe to call multiple times; only the first call attaches
   *  (`initialized` gates it independent of the IPC handle, which may be
   *  absent in non-browser environments). Call once at boot from `App.vue`
   *  (both the main + settings windows). In dev the bridge no-ops (returns
   *  IDLE) so the auto-check is silent and network-free. */
  function init(): void {
    if (initialized) return;
    initialized = true;
    if (typeof window !== "undefined" && window.appEvents) {
      ipcUnsub = window.appEvents.onUpdaterStatus((next) => applyStatus(next));
    }
    // Delay the first check so it doesn't race with boot/DB init; re-check
    // periodically so a published update surfaces without user action.
    checkTimer = setTimeout(() => {
      void checkForUpdates();
    }, AUTO_CHECK_DELAY_MS);
    checkInterval = setInterval(() => {
      void checkForUpdates();
    }, AUTO_CHECK_INTERVAL_MS);
  }

  /** Check the update provider for a newer release. Returns `true` on success
   *  (regardless of whether an update is available). Never throws. */
  async function checkForUpdates(): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const result = await desktop.updater.check.query();
      applyStatus(result);
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[updater] check failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** Download the available update. Returns `true` on success. Never throws. */
  async function downloadUpdate(): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const ok = await desktop.updater.download.mutate();
      // Refresh the snapshot so `readyToInstall` reflects the download result.
      try {
        applyStatus(await desktop.updater.status.query());
      } catch {
        /* status refresh is best-effort */
      }
      return ok;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[updater] download failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** Quit and install the downloaded update. Returns `true` if dispatched
   *  (the app then restarts). Never throws. */
  async function installUpdate(): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const ok = await desktop.updater.install.mutate();
      return ok;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[updater] install failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** Read the current status snapshot without a network check. Never throws. */
  async function refreshStatus(): Promise<boolean> {
    clearError();
    try {
      applyStatus(await desktop.updater.status.query());
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[updater] status failed:", e);
      return false;
    }
  }

  return {
    busy,
    status,
    lastError,
    phase,
    updateAvailable,
    readyToInstall,
    statusText,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    refreshStatus,
    clearError,
    init
  };
});

/** Test-only: reset the module-level init state (IPC handle + timers + flag).
 *  Not called in production — the store is a singleton that lives for the app
 *  lifetime, so `init()` wires once. Exported so the contract suite can test
 *  `init()` (IPC subscription + auto-check) in isolation across cases. */
export function resetUpdaterInitForTests(): void {
  initialized = false;
  ipcUnsub?.();
  ipcUnsub = undefined;
  if (checkTimer) clearTimeout(checkTimer);
  if (checkInterval) clearInterval(checkInterval);
  checkTimer = undefined;
  checkInterval = undefined;
}