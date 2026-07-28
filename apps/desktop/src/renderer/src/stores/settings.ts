import { defineStore } from "pinia";
import { ref } from "vue";
import { getDatabase, getCurrentContext } from "@/platform/bootstrap";
import type { TimeFormat, TrashCleanupInterval, Profile, DayFormat, WeekFormat } from "@notesnook-vue/contracts";
import { ThemeDark, ThemeLight, type VueTheme } from "@notesnook-vue/theme-vue";
import { logger, readLoggingEnabled, writeLoggingEnabled } from "@/utils/logger";
import {
  readCtxStringWithLegacy,
  writeCtxString,
  removeCtxKey,
  migrateLegacyToCtx
} from "@/platform/per-context-prefs";

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

/** Read the per-context `themeMode`, falling back to the legacy un-suffixed
 *  key (lazy migration — `loadClientPrefs` copies it into the ctx key). */
function readThemeMode(ctx: string): ThemeMode {
  const { value } = readCtxStringWithLegacy(THEME_MODE_KEY, ctx);
  return value === "light" || value === "dark" || value === "system" ? value : DEFAULT_THEME_MODE;
}

function writeThemeMode(mode: ThemeMode, ctx: string): void {
  writeCtxString(THEME_MODE_KEY, ctx, mode);
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

/** localStorage key for the `tasksShowCompleted` client-only toggle — when the
 *  Tasks sidebar view is active, whether notes whose tasks are ALL checked also
 *  appear (default off: only notes with open tasks show). Read by the notes
 *  store's `visibleItems` tasks predicate; no change-signal needed (the ref is
 *  reactive and that's the only consumer). */
const DEFAULT_TASKS_SHOW_COMPLETED = false;
export const TASKS_SHOW_COMPLETED_KEY = "notesnook.tasksShowCompleted";

function readTasksShowCompleted(): boolean {
  try {
    const v = localStorage.getItem(TASKS_SHOW_COMPLETED_KEY);
    if (v === "false") return false;
    if (v === "true") return true;
    return DEFAULT_TASKS_SHOW_COMPLETED;
  } catch {
    return DEFAULT_TASKS_SHOW_COMPLETED;
  }
}

function writeTasksShowCompleted(enabled: boolean): void {
  try {
    localStorage.setItem(TASKS_SHOW_COMPLETED_KEY, enabled ? "true" : "false");
  } catch {
    /* best-effort — persistence is optional */
  }
}

/**
 * Client-only transparency toggle (ours). When off, the renderer paints an
 * opaque theme background on the root so the translucent `bg-glass-*` surfaces
 * + `backdrop-filter` composite over an opaque base instead of the OS
 * acrylic/vibrancy — i.e. the glass/acrylic look is disabled, on any platform.
 * (`data-transparency="off"` on <html>; see style.css. Linux forces this off
 * regardless via `data-platform="linux"`, since the OS has no acrylic.) Persisted
 * to `localStorage` like `themeMode` so a `storage` event cross-window-syncs it.
 */
const DEFAULT_TRANSPARENCY_ENABLED = true;
export const TRANSPARENCY_ENABLED_KEY = "notesnook.transparencyEnabled";

export function readTransparencyEnabled(ctx: string): boolean {
  const { value } = readCtxStringWithLegacy(TRANSPARENCY_ENABLED_KEY, ctx);
  if (value === "false") return false;
  if (value === "true") return true;
  return DEFAULT_TRANSPARENCY_ENABLED;
}

function writeTransparencyEnabled(enabled: boolean, ctx: string): void {
  writeCtxString(TRANSPARENCY_ENABLED_KEY, ctx, enabled ? "true" : "false");
}

export const SEMANTIC_SEARCH_ENABLED_KEY = "notesnook.semanticSearchEnabled";
export const SEMANTIC_SEARCH_PROMPTED_KEY = "notesnook.semanticSearchPrompted";

/** Check if this is a brand new install for context `ctx` — no per-context key
 *  AND no legacy un-suffixed key for any of the four boot-signal keys. The
 *  legacy check is kept so an upgrading user (whose values still live under the
 *  un-suffixed keys until first read) is NOT re-prompted as a "new install". */
function isBrandNewInstall(ctx: string): boolean {
  const legacyAbsent =
    readCtxStringWithLegacy(SEMANTIC_SEARCH_PROMPTED_KEY, ctx).value === null &&
    readCtxStringWithLegacy(SEMANTIC_SEARCH_ENABLED_KEY, ctx).value === null &&
    readCtxStringWithLegacy(TRANSPARENCY_ENABLED_KEY, ctx).value === null &&
    readCtxStringWithLegacy(THEME_MODE_KEY, ctx).value === null;
  return legacyAbsent;
}

export function readSemanticSearchPrompted(ctx: string): boolean {
  const { value: p } = readCtxStringWithLegacy(SEMANTIC_SEARCH_PROMPTED_KEY, ctx);
  if (p === "true") return true;
  if (p === "false") return false;

  // Brand new installs are auto-marked as prompted (enabled by default without dialog)
  if (isBrandNewInstall(ctx)) {
    writeSemanticSearchPrompted(true, ctx);
    return true;
  }
  return false;
}

export function readSemanticSearchEnabled(ctx: string): boolean {
  const { value: v } = readCtxStringWithLegacy(SEMANTIC_SEARCH_ENABLED_KEY, ctx);
  if (v === "false") return false;
  if (v === "true") return true;

  // Brand new installs default to true; existing upgrading users default to false until prompted
  const isNew = isBrandNewInstall(ctx);
  if (isNew) {
    writeSemanticSearchEnabled(true, ctx);
    return true;
  }
  return false;
}

function writeSemanticSearchEnabled(enabled: boolean, ctx: string): void {
  writeCtxString(SEMANTIC_SEARCH_ENABLED_KEY, ctx, enabled ? "true" : "false");
}

export function writeSemanticSearchPrompted(prompted: boolean, ctx: string): void {
  writeCtxString(SEMANTIC_SEARCH_PROMPTED_KEY, ctx, prompted ? "true" : "false");
}

/**
 * Two-slot theme storage (mirrors upstream's `theme:dark` / `theme:light`
 * Config keys). The user picks a dark theme AND a light theme; `themeMode`
 * (light/dark/system) selects which slot is active (system → follow OS). A
 * freshly-installed upstream theme is stored as the full `VueTheme` JSON for its
 * `colorScheme`; defaults to `ThemeDark`/`ThemeLight` until a theme is
 * installed. We do NOT persist the defaults (so a theme-vue upgrade isn't
 * stuck with a stale built-in) — `readStoredTheme` falls back to the vendored
 * default when the key is absent or unparseable.
 */
export const THEME_DARK_KEY = "notesnook.theme.dark";
export const THEME_LIGHT_KEY = "notesnook.theme.light";

function readStoredTheme(base: string, ctx: string, fallback: VueTheme): VueTheme {
  const { value: raw } = readCtxStringWithLegacy(base, ctx);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as VueTheme;
  } catch {
    return fallback;
  }
}

function writeStoredTheme(base: string, ctx: string, theme: VueTheme): void {
  writeCtxString(base, ctx, JSON.stringify(theme));
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
  // The per-account client prefs (theme/transparency/semantic/theme slots) are
  // keyed by context in localStorage; the store reads them for the current
  // context at construction and again in `loadClientPrefs(ctx)` after a context
  // switch. `getCurrentContext()` is set by `bootstrap()` before the store is
  // first used (App.vue setup); in the headless test env it is mocked.
  const themeMode = ref<ThemeMode>(readThemeMode(getCurrentContext()));
  /** Bumped by `setThemeMode`; `App.vue` watches it to apply `setTheme` on-site. */
  const themeChangeSignal = ref(0);
  /** Whether the in-app upstream-release notifier may run its once-a-day check. */
  const upstreamReleaseCheckEnabled = ref<boolean>(readUpstreamCheckEnabled());
  /** Whether the Tasks view also lists notes whose tasks are all completed. */
  const tasksShowCompleted = ref<boolean>(readTasksShowCompleted());
  /** Whether the acrylic/glass look is on. Bumped-signal pattern mirrors
   *  `themeMode` — `App.vue` watches `transparencyChangeSignal` to apply the
   *  `data-transparency` attr on <html> on-site (keeps the store DOM-free). */
  const transparencyEnabled = ref<boolean>(readTransparencyEnabled(getCurrentContext()));
  const transparencyChangeSignal = ref(0);
  /** Whether on-device Semantic Vector Search is enabled. */
  const semanticSearchEnabled = ref<boolean>(readSemanticSearchEnabled(getCurrentContext()));
  /** Whether diagnostic `logger.log/warn/info` output is enabled (forced on in
   *  dev; off by default in packaged builds). Errors always print regardless. */
  const loggingEnabled = ref<boolean>(readLoggingEnabled());
  /** Whether the user has been prompted via dialog about vector search onboarding. */
  const semanticSearchPrompted = ref<boolean>(readSemanticSearchPrompted(getCurrentContext()));
  /** The two theme slots. Default to the vendored built-ins until a theme is
   *  installed from the catalog or imported from a file. */
  const darkTheme = ref<VueTheme>(readStoredTheme(THEME_DARK_KEY, getCurrentContext(), ThemeDark));
  const lightTheme = ref<VueTheme>(readStoredTheme(THEME_LIGHT_KEY, getCurrentContext(), ThemeLight));

  /**
   * Re-read the per-account client-only prefs (theme mode, transparency,
   * semantic-search toggles, theme slots) for `ctx` into the store refs, with
   * lazy legacy migration. Call after a context switch (the Settings window's
   * `switchContext`, the main window's `contextChangeSignal` watch) so the UI
   * reflects the newly-active account. `load()` only covers `db.settings`-backed
   * values; this covers the localStorage-backed ones. Defaults `ctx` to the live
   * context for convenience.
   */
  function loadClientPrefs(ctx: string = getCurrentContext()): void {
    // Lazy-migrate any legacy un-suffixed values into this ctx's keys on first
    // contact so an upgrading user's existing prefs carry forward to this account.
    migrateLegacyToCtx(THEME_MODE_KEY, ctx);
    migrateLegacyToCtx(TRANSPARENCY_ENABLED_KEY, ctx);
    migrateLegacyToCtx(SEMANTIC_SEARCH_ENABLED_KEY, ctx);
    migrateLegacyToCtx(SEMANTIC_SEARCH_PROMPTED_KEY, ctx);
    migrateLegacyToCtx(THEME_DARK_KEY, ctx);
    migrateLegacyToCtx(THEME_LIGHT_KEY, ctx);
    const prevMode = themeMode.value;
    const prevTransparency = transparencyEnabled.value;
    const prevDark = darkTheme.value;
    const prevLight = lightTheme.value;
    themeMode.value = readThemeMode(ctx);
    transparencyEnabled.value = readTransparencyEnabled(ctx);
    semanticSearchEnabled.value = readSemanticSearchEnabled(ctx);
    semanticSearchPrompted.value = readSemanticSearchPrompted(ctx);
    darkTheme.value = readStoredTheme(THEME_DARK_KEY, ctx, ThemeDark);
    lightTheme.value = readStoredTheme(THEME_LIGHT_KEY, ctx, ThemeLight);
    // Bump the change signals only when a value actually changed across the
    // context switch, so every window's existing `themeChangeSignal` /
    // `transparencyChangeSignal` watch re-applies the renderer theme +
    // transparency for the newly-active account (the Settings window has no
    // `applyTheme` of its own; it relies on this signal). No bump when the
    // values are unchanged (avoids a redundant `setNativeTheme` round-trip).
    if (
      themeMode.value !== prevMode ||
      darkTheme.value !== prevDark ||
      lightTheme.value !== prevLight
    ) {
      themeChangeSignal.value += 1;
    }
    if (transparencyEnabled.value !== prevTransparency) {
      transparencyChangeSignal.value += 1;
    }
  }

  /**
   * Read all db.settings-backed values into the store. Called on boot (after
   * the db is up) and can be re-called to refresh. Never throws — a failure
   * leaves the previous values intact. Client-only prefs are loaded at
   * construction and via `loadClientPrefs`, not here.
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
      logger.error("[settings] load failed:", e);
    }
  }

  async function setDateFormat(format: string): Promise<void> {
    try {
      await getDatabase().settings.setDateFormat(format);
      dateFormat.value = format;
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[settings] setDateFormat failed:", e);
    }
  }

  async function setTimeFormat(format: TimeFormat): Promise<void> {
    try {
      await getDatabase().settings.setTimeFormat(format);
      timeFormat.value = format;
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[settings] setTimeFormat failed:", e);
    }
  }

  async function setTitleFormat(format: string): Promise<void> {
    try {
      await getDatabase().settings.setTitleFormat(format);
      titleFormat.value = format;
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[settings] setTitleFormat failed:", e);
    }
  }

  async function setDayFormat(format: DayFormat): Promise<void> {
    try {
      await getDatabase().settings.setDayFormat(format);
      dayFormat.value = format;
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[settings] setDayFormat failed:", e);
    }
  }

  async function setWeekFormat(format: WeekFormat): Promise<void> {
    try {
      await getDatabase().settings.setWeekFormat(format);
      weekFormat.value = format;
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[settings] setWeekFormat failed:", e);
    }
  }

  async function setTrashCleanupInterval(interval: TrashCleanupInterval): Promise<void> {
    try {
      await getDatabase().settings.setTrashCleanupInterval(interval);
      trashCleanupInterval.value = interval;
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[settings] setTrashCleanupInterval failed:", e);
    }
  }

  async function setDefaultNotebook(notebookId: string | undefined): Promise<void> {
    try {
      await getDatabase().settings.setDefaultNotebook(notebookId);
      defaultNotebook.value = notebookId;
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[settings] setDefaultNotebook failed:", e);
    }
  }

  async function setDefaultTag(tagId: string | undefined): Promise<void> {
    try {
      await getDatabase().settings.setDefaultTag(tagId);
      defaultTag.value = tagId;
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[settings] setDefaultTag failed:", e);
    }
  }

  /** Set the vault auto-lock timeout (ms; `-1` = Never). Synced. */
  async function setVaultLockAfter(ms: number): Promise<void> {
    try {
      await getDatabase().settings.setVaultLockAfter(ms);
      vaultLockAfter.value = ms;
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[settings] setVaultLockAfter failed:", e);
    }
  }

  async function setProfile(partial: Partial<Profile> | undefined): Promise<void> {
    try {
      await getDatabase().settings.setProfile(partial);
      profile.value = getDatabase().settings.getProfile();
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[settings] setProfile failed:", e);
    }
  }

  /** Set the theme mode (light/dark/system), persist to the current account's
   *  localStorage key, and bump the change signal so `App.vue` re-applies
   *  `setTheme` on-site. */
  function setThemeMode(mode: ThemeMode): void {
    themeMode.value = mode;
    writeThemeMode(mode, getCurrentContext());
    themeChangeSignal.value += 1;
  }

  /** Toggle the in-app upstream-release notifier (client-only, localStorage). */
  function setUpstreamReleaseCheckEnabled(enabled: boolean): void {
    upstreamReleaseCheckEnabled.value = enabled;
    writeUpstreamCheckEnabled(enabled);
  }

  /** Toggle the Tasks view's "show completed" filter (client-only, localStorage). */
  function setTasksShowCompleted(enabled: boolean): void {
    tasksShowCompleted.value = enabled;
    writeTasksShowCompleted(enabled);
  }

  /** Set the transparency toggle, persist to the current account's localStorage
   *  key, and bump the change signal so `App.vue` re-applies
   *  `data-transparency` on-site. */
  function setTransparencyEnabled(enabled: boolean): void {
    transparencyEnabled.value = enabled;
    writeTransparencyEnabled(enabled, getCurrentContext());
    transparencyChangeSignal.value += 1;
  }

  /**
   * Mirror a `themeMode` change made in ANOTHER window (delivered via the
   * `storage` event) for context `ctx`. Updates the local ref only if `ctx` is
   * this window's active context — a theme change for account A must not flip
   * account B's window. Does NOT write localStorage (the other window already
   * did) and does NOT bump `themeChangeSignal` (the other window's `App.vue`
   * already re-applied; bumping here would re-trigger the local `applyTheme` →
   * `setNativeTheme` chain). The caller (`App.vue`) re-applies the renderer CSS
   * itself. `ctx === null` means a legacy un-suffixed write (treated as the
   * current context — transitional safety net).
   */
  function syncThemeMode(mode: ThemeMode, ctx: string | null): void {
    if (ctx !== null && ctx !== getCurrentContext()) return;
    themeMode.value = mode;
  }

  /**
   * Mirror a `transparencyEnabled` change made in ANOTHER window (delivered
   * via the `storage` event) for context `ctx`. Same contract as
   * `syncThemeMode`: ctx-gated, no localStorage write, no signal bump. The
   * caller (`App.vue`) re-applies `data-transparency` itself.
   */
  function syncTransparencyEnabled(enabled: boolean, ctx: string | null): void {
    if (ctx !== null && ctx !== getCurrentContext()) return;
    transparencyEnabled.value = enabled;
  }

  /**
   * Install `theme` into the slot for its `colorScheme` (dark/light) — persists
   * the full theme JSON to the current account's slot key + swaps that slot +
   * bumps `themeChangeSignal` so `App.vue` re-applies it if the slot is the
   * active one. Deliberately does NOT touch `themeMode` (light/dark/system):
   * installing a theme populates its slot, but which slot is active stays under
   * the user's mode control (the Appearance mode toggle). The other slot is
   * left untouched. (Upstream flips colorScheme on install; we don't — the user
   * keeps their mode.)
   */
  function setActiveTheme(theme: VueTheme): void {
    const ctx = getCurrentContext();
    if (theme.colorScheme === "dark") {
      darkTheme.value = theme;
      writeStoredTheme(THEME_DARK_KEY, ctx, theme);
    } else {
      lightTheme.value = theme;
      writeStoredTheme(THEME_LIGHT_KEY, ctx, theme);
    }
    themeChangeSignal.value += 1;
  }

  /**
   * Reset installed dark and light themes back to built-in stock themes
   * (ThemeDark / ThemeLight), remove the current account's stored theme
   * entries, and bump `themeChangeSignal` so active theme is re-applied on-site.
   */
  function restoreStockThemes(): void {
    const ctx = getCurrentContext();
    darkTheme.value = ThemeDark;
    lightTheme.value = ThemeLight;
    removeCtxKey(THEME_DARK_KEY, ctx);
    removeCtxKey(THEME_LIGHT_KEY, ctx);
    themeChangeSignal.value += 1;
  }

  /** Is `id` the currently-installed theme for either slot? */
  function isThemeApplied(id: string): boolean {
    return darkTheme.value.id === id || lightTheme.value.id === id;
  }

  /** Get the theme stored for a colorScheme slot. */
  function getTheme(colorScheme: "dark" | "light"): VueTheme {
    return colorScheme === "dark" ? darkTheme.value : lightTheme.value;
  }

  /**
   * Mirror a slot change made in ANOTHER window (via the `storage` event) for
   * context `ctx`. ctx-gated; no localStorage write (the other window did it)
   * and no signal bump (the other window's `App.vue` already re-applied; the
   * caller re-applies here).
   */
  function syncStoredTheme(colorScheme: "dark" | "light", theme: VueTheme, ctx: string | null): void {
    if (ctx !== null && ctx !== getCurrentContext()) return;
    if (colorScheme === "dark") darkTheme.value = theme;
    else lightTheme.value = theme;
  }

  function setSemanticSearchEnabled(enabled: boolean): void {
    semanticSearchEnabled.value = enabled;
    writeSemanticSearchEnabled(enabled, getCurrentContext());
  }

  function setSemanticSearchPrompted(prompted: boolean): void {
    semanticSearchPrompted.value = prompted;
    writeSemanticSearchPrompted(prompted, getCurrentContext());
  }

  function setLoggingEnabled(enabled: boolean): void {
    loggingEnabled.value = enabled;
    writeLoggingEnabled(enabled);
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
    tasksShowCompleted,
    transparencyEnabled,
    transparencyChangeSignal,
    semanticSearchEnabled,
    semanticSearchPrompted,
    loggingEnabled,
    darkTheme,
    lightTheme,
    load,
    loadClientPrefs,
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
    setUpstreamReleaseCheckEnabled,
    setTasksShowCompleted,
    setTransparencyEnabled,
    syncTransparencyEnabled,
    setSemanticSearchEnabled,
    setSemanticSearchPrompted,
    setLoggingEnabled,
    setActiveTheme,
    restoreStockThemes,
    isThemeApplied,
    getTheme,
    syncStoredTheme
  };
});