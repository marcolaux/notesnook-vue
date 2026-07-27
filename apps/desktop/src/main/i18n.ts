/**
 * Main-process i18n (Phase 7.2) — a tiny synchronous translator for the
 * Electron main process, which cannot host vue-i18n (a renderer-only Vue
 * plugin). Reads the same shared catalogs the renderer uses
 * (`../contracts/i18n`) and exposes `tMain` / `tMainMsg` for OS-level chrome:
 * the application menu, the tray context menu, window titles, and native file-
 * dialog filter names.
 *
 * Locale lifecycle:
 *  - {@link initMainLocale} is called once in `app.whenReady` BEFORE the menu
 *    + tray are registered, reading the persisted locale from `app-state.json`
 *    (sync) so first paint is already localized. The renderer's `localStorage`
 *    value is the primary store; `app-state.json` is the durable cross-origin
 *    mirror the renderer writes via the `appState.set` tRPC mutation.
 *  - {@link setMainLocale} is the `app:set-locale` IPC handler target: the
 *    renderer calls it (via `window.appEvents.setLocale`) after a locale switch
 *    so main rebuilds its chrome live. Menu/tray/window-title rebuilders
 *    register themselves via {@link registerLocaleChangeCallback} to avoid a
 *    circular import (they import `tMain` from here).
 *
 * The pseudo dev locale is built with the shared `toPseudo(en)` so a dev sweep
 * covers OS-level chrome too. Real locales (e.g. `de`) are appended to the
 * messages map as their catalog files land (German in Batch 3).
 */
import en from "../contracts/i18n/en";
import {
  translate,
  translateMessage,
  toPseudo,
  DEFAULT_LOCALE,
  type Locale,
  type Messages
} from "../contracts/i18n";
import { readAppStateSync, appStateServer } from "./app-state";

/** Locale catalogs available to the main process. `de` is appended in Batch 3. */
const messages: Partial<Record<Locale, Messages>> = {
  en,
  pseudo: toPseudo(en)
};

/** The active main-process locale (read at boot, switched via the IPC). */
let activeLocale: Locale = DEFAULT_LOCALE;

/** Rebuilders that run on a live locale change (menu / tray / window titles).
 *  Registered by the surface modules to break the `tMain`-import cycle. */
const changeCallbacks: Array<(locale: Locale) => void> = [];

/** Register a callback fired (best-effort, isolated) when the main locale
 *  changes at runtime, so the surface can rebuild in the new language. */
export function registerLocaleChangeCallback(fn: (locale: Locale) => void): void {
  changeCallbacks.push(fn);
}

/** Read the persisted locale at boot (sync, cached) and set the active one.
 *  Call in `app.whenReady` BEFORE registering the menu / tray / windows. */
export function initMainLocale(): void {
  activeLocale = readAppStateSync().locale ?? DEFAULT_LOCALE;
}

/** The currently active main-process locale. */
export function getMainLocale(): Locale {
  return activeLocale;
}

/** Switch the main-process locale + persist + rebuild OS-level chrome.
 *  Idempotent (no-op if unchanged). Each rebuilder runs in isolation so a
 *  throw in one doesn't block the rest. Persistence is best-effort (the
 *  renderer's `appState.set` mutation already persists on its side). */
export function setMainLocale(locale: Locale): void {
  if (locale === activeLocale) return;
  activeLocale = locale;
  try {
    void appStateServer.set({ locale });
  } catch {
    /* best-effort */
  }
  for (const fn of changeCallbacks) {
    try {
      fn(locale);
    } catch {
      /* isolate rebuilders */
    }
  }
}

/** Translate `key` for the active main locale (with `{param}` interpolation +
 *  `|`-plural by a numeric `n`), falling back to `en` per-key. Returns the key
 *  path when nothing resolves (so a miss is visible). */
export function tMain(key: string, params?: Record<string, unknown>): string {
  return translate(messages, activeLocale, key, params);
}

/** Resolve an array message (e.g. weekday names) for the active main locale,
 *  falling back to `en`. `undefined` on miss / non-array. */
export function tMainMsg(key: string): unknown[] | undefined {
  return translateMessage(messages, activeLocale, key);
}