import { defineStore } from "pinia";
import { ref } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import type { TimeFormat, TrashCleanupInterval, Profile, DayFormat, WeekFormat } from "@notesnook-vue/contracts";

/**
 * Settings store (Phase 7) — the headless data backend for `SettingsView`.
 * Combines two kinds of setting:
 *
 *  - **`db.settings`-backed (upstream, applies here):** date/time/title/day/week
 *    format, trash-cleanup interval, default notebook, profile. These map 1:1
 *    to the typed accessors `@notesnook/core`'s `Settings` collection exposes.
 *    (The npm-pinned 8.1.3 core lacked `getDayFormat`/`getWeekFormat`; the
 *    vendored upstream core has them, so they're wired in now.)
 *
 *  - **Client-only (ours):** `themeMode` (light/dark/system) — applied through
 *    `@notesnook-vue/theme-vue`'s `setTheme`, our Tailwind-token adapter
 *    (upstream uses theme-ui; this setting + the adapter are genuinely ours).
 *    Persisted to `localStorage` (best-effort — the auth store's skip-key uses
 *    the same pattern); the store emits a `themeChangeSignal` that `App.vue`
 *    watches to call `setTheme` on-site (keeps the store DOM-free + testable).
 *
 * Deferred (need on-site consumers / a UI to be meaningful): `toolbarConfig`
 * (Phase 5.3 toolbar), `sideBarOrder`/`sideBarHiddenItems` (sidebar drag-sort),
 * `groupOptions` (list grouping), and the `Config`-backed editor toggles
 * (double-spaced lines, markdown shortcuts, font ligatures, hide note title,
 * homepage, image compression) — all inert without their on-site wiring.
 */

export type ThemeMode = "light" | "dark" | "system";

const THEME_MODE_KEY = "notesnook.themeMode";
const DEFAULT_DATE_FORMAT = "DD-MM-YYYY";
const DEFAULT_TIME_FORMAT: TimeFormat = "12-hour";
const DEFAULT_TITLE_FORMAT = "Note $date$ $time$";
const DEFAULT_DAY_FORMAT: DayFormat = "long";
const DEFAULT_WEEK_FORMAT: WeekFormat = "Mon";
const DEFAULT_TRASH_CLEANUP: TrashCleanupInterval = 7;
const DEFAULT_THEME_MODE: ThemeMode = "dark";

function readThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_MODE_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
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
  const profile = ref<Profile | undefined>(undefined);

  // --- client-only (ours) ----------------------------------------------------
  const themeMode = ref<ThemeMode>(readThemeMode());
  /** Bumped by `setThemeMode`; `App.vue` watches it to apply `setTheme` on-site. */
  const themeChangeSignal = ref(0);

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

  return {
    dateFormat,
    timeFormat,
    titleFormat,
    dayFormat,
    weekFormat,
    trashCleanupInterval,
    defaultNotebook,
    profile,
    themeMode,
    themeChangeSignal,
    load,
    setDateFormat,
    setTimeFormat,
    setTitleFormat,
    setDayFormat,
    setWeekFormat,
    setTrashCleanupInterval,
    setDefaultNotebook,
    setProfile,
    setThemeMode
  };
});