/**
 * i18n foundation (Phase 2.6 / 7.1) — a Vue-native `vue-i18n` instance for the
 * renderer, with an English catalog seeded from the codebase's existing
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
 * Full migration of every hardcoded string is Phase 7.1 polish; this module +
 * the seeded keys + the Sidebar slice prove the pattern.
 */
import { createI18n } from "vue-i18n";
import en from "./locales/en";
import pseudo from "./locales/pseudo";

export { default as en } from "./locales/en";
export { default as pseudo, toPseudo } from "./locales/pseudo";

/** Locales shipped with the app. `pseudo` is a dev affordance, not a real one. */
export const LOCALES = ["en", "pseudo"] as const;
export type Locale = (typeof LOCALES)[number];

/** Dev-only pseudo locale (wrapped English — surfaces untranslated strings). */
export const PSEUDO_LOCALE: Locale = "pseudo";

const LOCALE_STORAGE_KEY = "notesnook.locale";
const DEFAULT_LOCALE: Locale = "en";

/** Read the persisted locale choice, falling back to the default. Best-effort. */
function readLocale(): Locale {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY);
    return v === "en" || v === "pseudo" ? v : DEFAULT_LOCALE;
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

const i18n = createI18n({
  legacy: false,
  locale: readLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { en, pseudo }
});

export default i18n;

/** Switch the active locale + persist the choice. Best-effort persistence. */
export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale;
  writeLocale(locale);
}

/** The currently active locale (reactive — a writable computed ref). */
export const locale = i18n.global.locale;