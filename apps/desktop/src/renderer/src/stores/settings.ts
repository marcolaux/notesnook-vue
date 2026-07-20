import { defineStore } from "pinia";
import { ref } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import type { TimeFormat, TrashCleanupInterval, Profile, DayFormat, WeekFormat } from "@notesnook-vue/contracts";

/**
 * Settings store (Phase 7) — the headless data backend for `SettingsView`.
 * Combines two kinds of setting:
 *
 *  - **`db.settings`-backed (upstream, applies here):** date/time/title/day/week
 *    format, trash-cleanup interval, default notebook, default tag, vault
 *    lock-after, profile. These map 1:1 to the typed accessors
 *    `@notesnook/core`'s `Settings` collection exposes — they are upstream's
 *    existing synced `SettingItemMap` keys, so writing them round-trips through
 *    sync with upstream clients identically (we must NOT invent new synced
 *    keys; these aren't ours, they're upstream's). (The npm-pinned 8.1.3 core
 *    lacked `getDayFormat`/`getWeekFormat`; the vendored upstream core has them,
 *    so they're wired in now.)
 *
 *  - **Client-only (ours):** `themeMode` (light/dark/system) — applied through
 *    `@notesnook-vue/theme-vue`'s `setTheme`, our Tailwind-token adapter
 *    (upstream uses theme-ui; this setting + the adapter are genuinely ours).
 *    Persisted to `localStorage` (best-effort — the auth store's skip-key uses
 *    the same pattern); the store emits a `themeChangeSignal` that `App.vue`
 *    watches to call `setTheme` on-site (keeps the store DOM-free + testable).
 *
 * `profile` (fullName/profilePicture) is loaded here but has no UI — upstream
 * writes it from account data, not a settings row, so it stays account-state.
 *
 * Deferred (need on-site consumers / a UI to be meaningful): `toolbarConfig`
 * (Phase 5.3 toolbar — also needs a shape check vs upstream's `ToolbarConfig`
 * before its sync is enabled, since our TipTap editor differs), `sideBarOrder`/
 * `sideBarHiddenItems` (sidebar drag-sort), `groupOptions` (list grouping), and
 * the `Config`-backed editor toggles (double-spaced lines, markdown shortcuts,
 * font ligatures, hide note title, homepage, image compression) — all inert
 * without their on-site wiring.
 */

export type ThemeMode = "light" | "dark" | "system";

/** localStorage key for the persisted `themeMode`. Shared across same-origin
 *  Electron windows, so a `storage` event fires in the *other* window when
 *  one changes the theme — used by `App.vue` to sync the renderer theme
 *  cross-window (the settings window changes it; the main window re-applies). */
export const THEME_MODE_KEY = "notesnook.themeMode";
const DEFAULT_DATE_FORMAT = "DD-MM-YYYY";
const DEFAULT_TIME_FORMAT: TimeFormat = "12-hour";
const DEFAULT_TITLE_FORMAT = "Note $date$ $time$";
const DEFAULT_DAY_FORMAT: DayFormat = "long";
const DEFAULT_WEEK_FORMAT: WeekFormat = "Mon";
const DEFAULT_TRASH_CLEANUP: TrashCleanupInterval = 7;
/** Upstream's default for `vault:lockAfter` (30 min). `-1` = Never. */
const DEFAULT_VAULT_LOCK_AFTER = 1000 * 60 * 30;
const DEFAULT_THEME_MODE: ThemeMode = "dark";
/** Default for the client-only upstream-release check (on — it's a once-a-day
 *  GitHub API call; users who'd rather not ping api.github.com can turn it off). */
const DEFAULT_UPSTREAM_CHECK_ENABLED = true;

function readThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_MODE_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

/** localStorage key for the `upstreamReleaseCheckEnabled` client-only toggle. */
export const UPSTREAM_CHECK_ENABLED_KEY = "notesnook.upstreamReleaseCheckEnabled";

function readUpstreamCheckEnabled(): boolean {
  try {
    const v = localStorage.getItem(UPSTREAM_CHECK_ENABLED_KEY);
    if (v === "false") return false;
    if (v === "true") return true;
    return DEFAULT_UPSTREAM_CHECK_ENABLED;
  } catch {
    return DEFAULT_UPSTREAM_CHECK_ENABLED;
  }
}

function writeUpstreamCheckEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(UPSTREAM_CHECK_ENABLED_KEY, enabled ? "true" : "false");
  } catch {
    /* best-effort — persistence is optional */
  }
}

function writeThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_MODE_KEY, mode);
  } catch {
    /* best-effort — persistence is optional */
  }
}

export const useSettingsStore = defineStore("settings", () => {
  // --- db.settings-backed ---------------------------------------------------
  const dateFormat = ref<string>(DEFAULT_DATE_FORMAT);
  const timeFormat = ref<TimeFormat>(DEFAULT_TIME_FORMAT);
  const titleFormat = ref<string>(DEFAULT_TITLE_FORMAT);
  const dayFormat = ref<DayFormat>(DEFAULT_DAY_FORMAT);
  const weekFormat = ref<WeekFormat>(DEFAULT_WEEK_FORMAT);
  const trashCleanupInterval = ref<TrashCleanupInterval>(DEFAULT_TRASH_CLEANUP);
  const defaultNotebook = ref<string | undefined>(undefined);
  const defaultTag = ref<string | undefined>(undefined);
  /** Vault auto-lock timeout in ms (upstream `vault:lockAfter`); `-1` = Never. */
  const vaultLockAfter = ref<number>(DEFAULT_VAULT_LOCK_AFTER);
  const profile = ref<Profile | undefined>(undefined);

  // --- client-only (ours) ----------------------------------------------------
  const themeMode = ref<ThemeMode>(readThemeMode());
  /** Bumped by `setThemeMode`; `App.vue` watches it to apply `setTheme` on-site. */
  const themeChangeSignal = ref(0);
  /** Whether the in-app upstream-release notifier may run its once-a-day check. */
  const upstreamReleaseCheckEnabled = ref<boolean>(readUpstreamCheckEnabled());

  /**
   * Read all db.settings-backed values into the store. Called on boot (after
   * the db is up) and can be re-called to refresh. Never throws — a failure
   * leaves the previous values intact. `themeMode` is loaded from
   * `localStorage` at construction, not here.
   */
  async function load(): Promise<void> {
    try {
      const db = getDatabase();
      const s = db.settings;
      dateFormat.value = s.getDateFormat();
      timeFormat.value = s.getTimeFormat();
      titleFormat.value = s.getTitleFormat();
      dayFormat.value = s.getDayFormat();
      weekFormat.value = s.getWeekFormat();
      trashCleanupInterval.value = s.getTrashCleanupInterval();
      defaultNotebook.value = s.getDefaultNotebook();
      defaultTag.value = s.getDefaultTag();
      vaultLockAfter.value = s.getVaultLockAfter();
      profile.value = s.getProfile();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[settings] load failed:", e);
    }
  }

  async function setDateFormat(format: string): Promise<void> {
    try {
      await getDatabase().settings.setDateFormat(format);
      dateFormat.value = format;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[settings] setDateFormat failed:", e);
    }
  }

  async function setTimeFormat(format: TimeFormat): Promise<void> {
    try {
      await getDatabase().settings.setTimeFormat(format);
      timeFormat.value = format;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[settings] setTimeFormat failed:", e);
    }
  }

  async function setTitleFormat(format: string): Promise<void> {
    try {
      await getDatabase().settings.setTitleFormat(format);
      titleFormat.value = format;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[settings] setTitleFormat failed:", e);
    }
  }

  async function setDayFormat(format: DayFormat): Promise<void> {
    try {
      await getDatabase().settings.setDayFormat(format);
      dayFormat.value = format;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[settings] setDayFormat failed:", e);
    }
  }

  async function setWeekFormat(format: WeekFormat): Promise<void> {
    try {
      await getDatabase().settings.setWeekFormat(format);
      weekFormat.value = format;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[settings] setWeekFormat failed:", e);
    }
  }

  async function setTrashCleanupInterval(interval: TrashCleanupInterval): Promise<void> {
    try {
      await getDatabase().settings.setTrashCleanupInterval(interval);
      trashCleanupInterval.value = interval;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[settings] setTrashCleanupInterval failed:", e);
    }
  }

  async function setDefaultNotebook(notebookId: string | undefined): Promise<void> {
    try {
      await getDatabase().settings.setDefaultNotebook(notebookId);
      defaultNotebook.value = notebookId;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[settings] setDefaultNotebook failed:", e);
    }
  }

  async function setDefaultTag(tagId: string | undefined): Promise<void> {
    try {
      await getDatabase().settings.setDefaultTag(tagId);
      defaultTag.value = tagId;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[settings] setDefaultTag failed:", e);
    }
  }

  /** Set the vault auto-lock timeout (ms; `-1` = Never). Synced. */
  async function setVaultLockAfter(ms: number): Promise<void> {
    try {
      await getDatabase().settings.setVaultLockAfter(ms);
      vaultLockAfter.value = ms;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[settings] setVaultLockAfter failed:", e);
    }
  }

  async function setProfile(partial: Partial<Profile> | undefined): Promise<void> {
    try {
      await getDatabase().settings.setProfile(partial);
      profile.value = getDatabase().settings.getProfile();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[settings] setProfile failed:", e);
    }
  }

  /** Set the theme mode (light/dark/system), persist to localStorage, and bump
   * the change signal so `App.vue` re-applies `setTheme` on-site. */
  function setThemeMode(mode: ThemeMode): void {
    themeMode.value = mode;
    writeThemeMode(mode);
    themeChangeSignal.value += 1;
  }

  /** Toggle the in-app upstream-release notifier (client-only, localStorage). */
  function setUpstreamReleaseCheckEnabled(enabled: boolean): void {
    upstreamReleaseCheckEnabled.value = enabled;
    writeUpstreamCheckEnabled(enabled);
  }

  /**
   * Mirror a `themeMode` change made in ANOTHER window (delivered via the
   * `storage` event). Updates the local ref so this window's system-mode
   * OS-preference listener etc. see the right value, but does NOT write
   * localStorage (the other window already did) and does NOT bump
   * `themeChangeSignal` (the other window's `App.vue` already re-applied;
   * bumping here would re-trigger the local `applyTheme` → `setNativeTheme`
   * chain). The caller (`App.vue`) re-applies the renderer CSS itself.
   */
  function syncThemeMode(mode: ThemeMode): void {
    themeMode.value = mode;
  }

  return {
    dateFormat,
    timeFormat,
    titleFormat,
    dayFormat,
    weekFormat,
    trashCleanupInterval,
    defaultNotebook,
    defaultTag,
    vaultLockAfter,
    profile,
    themeMode,
    themeChangeSignal,
    upstreamReleaseCheckEnabled,
    load,
    setDateFormat,
    setTimeFormat,
    setTitleFormat,
    setDayFormat,
    setWeekFormat,
    setTrashCleanupInterval,
    setDefaultNotebook,
    setDefaultTag,
    setVaultLockAfter,
    setProfile,
    setThemeMode,
    syncThemeMode,
    setUpstreamReleaseCheckEnabled
  };
});