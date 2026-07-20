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
 * `utils/updater.ts`. It does not subscribe to the optional `updater:status`
 * IPC event (on-site UI may wire that for live progress); callers can poll
 * `refreshStatus()` or re-run `checkForUpdates()`.
 */
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
    refreshStatus
  };
});