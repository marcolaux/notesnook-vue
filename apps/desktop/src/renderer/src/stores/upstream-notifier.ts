import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { desktop } from "@/platform/desktop-bridge";
import { useSettingsStore } from "@/stores/settings";
import type { UpstreamReleaseStatus } from "@contracts/router";
import { logger } from "@/utils/logger";

/**
 * Upstream-release notifier store — the reactive surface for the main-process
 * `upstreamChecker` bridge (`desktop.upstreamChecker.check`). On boot (and at
 * most once per day) it asks the main process to fetch the latest
 * `streetwriters/notesnook` desktop-stable release from GitHub and compare it
 * against the release we developed against (baked at build time). When a newer
 * release exists it fires a system `Notification` (once per tag) and exposes
 * `hasNewer` so the title bar can show a persistent "upstream update" indicator.
 *
 * Design (mirrors `stores/updater.ts`):
 *  - **Never throws.** `maybeCheck` catches bridge errors and leaves state
 *    intact — a GitHub outage never breaks app boot (the bootstrap caller also
 *    fire-and-forgets it).
 *  - **Throttled.** At most one network check per 24h (persisted to
 *    `localStorage`) so restarts don't hammer the unauthenticated GitHub API
 *    (60/hr per IP). `checkNow(true)` bypasses the throttle.
 *  - **Once-per-tag notification.** `notifiedTag` records the last tag we
 *    surfaced a system notification for, so the same release doesn't re-notify
 *    on every daily check. `dismiss()` hides the title-bar indicator until a
 *    newer tag arrives.
 *  - **Privacy toggle.** Honors `settings.upstreamReleaseCheckEnabled` (client
 *    only) — off ⇒ no check, no network call.
 *
 * The `Notification` Web API is available in the Electron renderer; we guard
 * for its absence so the store is unit-testable in a Node environment.
 */

const LAST_CHECK_KEY = "notesnook.upstream.lastCheckAt";
const NOTIFIED_TAG_KEY = "notesnook.upstream.notifiedTag";
const DISMISSED_TAG_KEY = "notesnook.upstream.dismissedTag";
/** Throttle: at most one network check per 24h. */
const THROTTLE_MS = 24 * 60 * 60 * 1000;

function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* best-effort */
  }
}

/** True iff the latest release is newer than baseline and not dismissed. */
function indicatorVisible(status: UpstreamReleaseStatus | null, dismissedTag: string | null): boolean {
  if (!status || !status.isNewer || !status.latestTag) return false;
  return status.latestTag !== dismissedTag;
}

export const useUpstreamNotifierStore = defineStore("upstream-notifier", () => {
  /** Last check result from the main bridge (null before the first check). */
  const status = ref<UpstreamReleaseStatus | null>(null);
  /** A check is in flight. */
  const busy = ref(false);
  const lastError = ref<string | null>(null);

  const lastCheckAt = ref<string | null>(readString(LAST_CHECK_KEY));
  const notifiedTag = ref<string | null>(readString(NOTIFIED_TAG_KEY));
  const dismissedTag = ref<string | null>(readString(DISMISSED_TAG_KEY));

  /** A newer upstream release is available and not yet dismissed. */
  const hasNewer = computed(() => indicatorVisible(status.value, dismissedTag.value));

  /** Fire a system notification for a newer release (no-op outside Electron). */
  function notify(latest: UpstreamReleaseStatus): void {
    if (typeof globalThis.Notification !== "function") return;
    try {
      const n = new globalThis.Notification("Notesnook upstream release available", {
        body: `${latest.latestTag} released — you built against ${latest.baselineTag}.`,
        tag: "nn-upstream-release"
      });
      // Open the release page on click (best-effort).
      if (latest.latestUrl) {
        n.onclick = () => {
          if (typeof globalThis.open === "function") globalThis.open(latest.latestUrl!, "_blank");
        };
      }
    } catch {
      /* Notifications may be disabled at the OS level — non-fatal. */
    }
  }

  /**
   * Run the upstream check, subject to the privacy toggle + 24h throttle.
   * `force` bypasses the throttle. Never throws. Returns `true` on a
   * successful bridge round-trip (regardless of whether a newer release was
   * found).
   */
  async function maybeCheck(force = false): Promise<boolean> {
    const settings = useSettingsStore();
    if (!settings.upstreamReleaseCheckEnabled) return false;
    if (!force) {
      const last = lastCheckAt.value ? Date.parse(lastCheckAt.value) : NaN;
      if (Number.isFinite(last) && Date.now() - last < THROTTLE_MS) {
        return false; // throttled — keep the previous status
      }
    }
    busy.value = true;
    lastError.value = null;
    try {
      const result = await desktop.upstreamChecker.check.query();
      status.value = result;
      lastCheckAt.value = new Date().toISOString();
      writeString(LAST_CHECK_KEY, lastCheckAt.value);
      if (result.isNewer && result.latestTag && result.latestTag !== notifiedTag.value) {
        notify(result);
        notifiedTag.value = result.latestTag;
        writeString(NOTIFIED_TAG_KEY, result.latestTag);
      }
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      logger.error("[upstream-notifier] check failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** Hide the title-bar indicator for the current latest tag (until a newer
   *  release appears). Also suppresses re-notification for this tag. */
  function dismiss(): void {
    const tag = status.value?.latestTag ?? null;
    if (tag) {
      dismissedTag.value = tag;
      writeString(DISMISSED_TAG_KEY, tag);
    }
  }

  return {
    status,
    busy,
    lastError,
    hasNewer,
    maybeCheck,
    dismiss
  };
});