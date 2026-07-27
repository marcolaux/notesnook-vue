/**
 * i18n foundation (Phase 2.6 / 7.1 / 7.2) — a Vue-native `vue-i18n` instance for
 * the renderer, with an English catalog seeded from the codebase's existing
 * strings + a pseudo-locale for dev.
 *
 * Why vue-i18n (not upstream `@notesnook/intl` / Lingui): upstream's `intl`
 * package is Lingui+`@lingui/macro`+React-coupled (a 2810-line `strings.ts`
 * importing a `generated/` codegen produced by the upstream React app, with
 * `react` as a peer dep) and ships only `en` + a pseudo locale — no real
 * translations to port. Our Vue renderer's UI doesn't mirror upstream's React
 * component structure 1:1, so the upstream string catalog wouldn't map cleanly
 * anyway. A Vue-native catalog with our own keys is simpler, has no
 * macro-compile step, and no React peer. (NEXT_STEPS open decision #1.)
 *
 * Composition API mode (`legacy: false`): components use `useI18n()`'s `t`,
 * and the global locale is a writable ref (`i18n.global.locale.value`).
 * `setLocale` switches it + persists the choice to `localStorage` (best-effort,
 * mirroring the settings store's `themeMode` persistence). The pseudo locale
 * makes untranslated strings visible during dev.
 *
 * Phase 7.2: the catalog (`en`), the locale registry (`LOCALES`/`Locale`), and
 * the pure translator live in the shared `@contracts/i18n` module so the
 * Electron main process (which cannot host vue-i18n) translates the same keys
 * for its OS-level chrome (app menu / tray / window titles / native dialogs).
 * `setLocale` also notifies main over the `app:set-locale` IPC + mirrors the
 * choice to the main-owned `app-state.json` so it survives boot + renderer-
 * origin drift. See `src/main/i18n.ts` for the main side.
 *
 * Full migration of every hardcoded string is Phase 7.1 (DONE); real locales +
 * `.po` round-trip land in Phase 7.2.
 */
import { createI18n } from "vue-i18n";
import { en, de, LOCALES, DEFAULT_LOCALE, PSEUDO_LOCALE, type Locale } from "@contracts/i18n";
import pseudo, { toPseudo } from "./locales/pseudo";

export { default as en } from "@contracts/i18n/en";
export { default as de } from "@contracts/i18n/de";
export { default as pseudo, toPseudo } from "./locales/pseudo";
export { LOCALES, DEFAULT_LOCALE, PSEUDO_LOCALE, type Locale } from "@contracts/i18n";

/** `localStorage` key holding the persisted locale choice. Shared across same-
 *  origin Electron windows, so a `storage` event fires in the *other* open
 *  windows when one window changes the locale — the cross-window sync hook
 *  (see `syncLocale` + `App.vue`'s storage listener) uses this to switch every
 *  window's vue-i18n locale live, not just the one that made the change. */
export const LOCALE_STORAGE_KEY = "notesnook.locale";

/** Read the persisted locale choice, falling back to the default. Best-effort. */
function readLocale(): Locale {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY);
    return (LOCALES as readonly string[]).includes(v ?? "") ? (v as Locale) : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Persist the locale choice. Best-effort — persistence is optional. */
function writeLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore — persistence is optional */
  }
}

/** Propagate the locale to the main process: (1) mirror it to the main-owned
 *  `app-state.json` (origin-independent, survives renderer-origin drift) so
 *  main can read it synchronously at boot, and (2) notify main over the
 *  `app:set-locale` IPC so it rebuilds its OS-level chrome (app menu / tray /
 *  window titles) live without a restart. Both are best-effort: a bridge
 *  hiccup never blocks the renderer's own locale switch. The app-state mirror
 *  is lazy-imported so the i18n module stays importable from non-component code
 *  that doesn't need the bridge, and so test environments without the bridge
 *  don't pull it in. */
function notifyMain(locale: Locale): void {
  try {
    void window.appEvents?.setLocale?.(locale);
  } catch {
    /* best-effort */
  }
  try {
    void import("@/platform/app-state")
      .then(({ setAppState }) => setAppState({ locale }))
      .catch(() => {});
  } catch {
    /* best-effort */
  }
}

const i18n = createI18n({
  legacy: false,
  locale: readLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { en, de, pseudo }
});

export default i18n;

/** Switch the active locale + persist the choice + notify main. Best-effort
 *  persistence + IPC. */
export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale;
  writeLocale(locale);
  notifyMain(locale);
}

/** Apply a locale change that originated in ANOTHER window (cross-window sync
 *  via the `storage` event — `App.vue` listens for `LOCALE_STORAGE_KEY`
 *  writes). Sets THIS window's vue-i18n locale ref ONLY: it does NOT re-persist
 *  to `localStorage` or re-notify main, since the originating window already
 *  did both (and the `storage` event doesn't fire in the originator, so there's
 *  no double-apply there). No-op if `locale` isn't a known locale (e.g. the key
 *  was cleared). */
export function syncLocale(locale: string | null): void {
  if (locale != null && (LOCALES as readonly string[]).includes(locale)) {
    i18n.global.locale.value = locale as Locale;
  }
}

/** The currently active locale (reactive — a writable computed ref). */
export const locale = i18n.global.locale;
