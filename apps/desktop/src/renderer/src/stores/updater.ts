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

  /** Controls visibility of the changelog modal dialog. */
  const showChangelog = ref(false);
  const dismissedVersion = ref<string | null>(null);

  /** Coarse phase derived from the snapshot (pure helper). */
  const phase = computed<UpdatePhase>(() => {
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
    const isNew = (next.available || next.downloaded) && next.version && next.version !== dismissedVersion.value;
    status.value = next;
    if (isNew) {
      showChangelog.value = true;
    }
  }

  function openChangelog(): void {
    if (!status.value.version) {
      status.value = {
        available: true,
        version: __APP_VERSION__,
        downloaded: false,
        progress: 0
      };
    }
    showChangelog.value = true;
  }

  function closeChangelog(): void {
    showChangelog.value = false;
  }

  function dismissChangelog(): void {
    showChangelog.value = false;
    if (status.value.version) {
      dismissedVersion.value = status.value.version;
    }
  }

  function triggerTestChangelog(): void {
    status.value = {
      available: true,
      version: __APP_VERSION__,
      downloaded: false,
      progress: 0
    };
    dismissedVersion.value = null;
    showChangelog.value = true;
  }

  function init(): void {
    if (initialized) return;
    initialized = true;
    if (typeof window !== "undefined" && window.appEvents) {
      ipcUnsub = window.appEvents.onUpdaterStatus((next) => applyStatus(next));
    }
    checkTimer = setTimeout(() => {
      void checkForUpdates();
    }, AUTO_CHECK_DELAY_MS);
    checkInterval = setInterval(() => {
      void checkForUpdates();
    }, AUTO_CHECK_INTERVAL_MS);
  }

  async function checkForUpdates(): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const result = await desktop.updater.check.query();
      applyStatus(result);
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      console.error("[updater] check failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  async function downloadUpdate(): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const ok = await desktop.updater.download.mutate();
      try {
        applyStatus(await desktop.updater.status.query());
      } catch {
        /* status refresh is best-effort */
      }
      return ok;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      console.error("[updater] download failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  async function installUpdate(): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const ok = await desktop.updater.install.mutate();
      return ok;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      console.error("[updater] install failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  async function refreshStatus(): Promise<boolean> {
    clearError();
    try {
      applyStatus(await desktop.updater.status.query());
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
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
    showChangelog,
    openChangelog,
    closeChangelog,
    dismissChangelog,
    triggerTestChangelog,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    refreshStatus,
    clearError,
    init
  };
});

export function resetUpdaterInitForTests(): void {
  initialized = false;
  ipcUnsub?.();
  ipcUnsub = undefined;
  if (checkTimer) clearTimeout(checkTimer);
  if (checkInterval) clearInterval(checkInterval);
  checkTimer = undefined;
  checkInterval = undefined;
}