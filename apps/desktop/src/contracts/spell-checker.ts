/**
 * Spell-checker contract (Phase 6.6) — the pure, dependency-free surface
 * shared by the main-process `SpellCheckerServer` impl (`src/main/spell-checker.ts`)
 * and the renderer store (`stores/spell-checker.ts`). Mirrors the upstream
 * `apps/desktop/src/api/spell-checker.ts` language table + resolution logic so
 * call sites stay compatible, but lives here (not in `src/main`) so the main
 * process can import it without pulling renderer paths, and tests can exercise
 * it without Electron.
 *
 * Electron's `session` spell-check API speaks language *codes* (`"en-US"`,
 * `"de-DE"`, …). This module turns those codes into display names and resolves
 * a requested code against the set of codes the platform actually supports
 * (falling back to the bare language tag, then to a redirect map for codes
 * upstream remaps, e.g. `es` → `es-MX`).
 */

/** A language the spell-checker can use, with a human-readable name. */
export interface Language {
  code: string;
  name: string;
}

/**
 * Display names for every spell-checker language code Electron may report.
 * Verbatim from upstream `apps/desktop/src/api/spell-checker.ts` so the
 * renderer's labels match the upstream app.
 */
export const LANGUAGES: Record<string, string> = {
  af: "Afrikaans",
  bg: "Bulgarian",
  ca: "Catalan",
  cs: "Czech",
  cy: "Welsh",
  da: "Danish",
  de: "German",
  "de-DE": "German (Germany)",
  el: "Greek",
  en: "English",
  "en-AU": "English (Australia)",
  "en-CA": "English (Canada)",
  "en-GB": "English (UK)",
  "en-GB-oxendict": "English (UK Oxford)",
  "en-US": "English (US)",
  es: "Spanish",
  "es-419": "Spanish (Latin America)",
  "es-AR": "Spanish (Argentina)",
  "es-ES": "Spanish (Spain)",
  "es-MX": "Spanish (Mexico)",
  "es-US": "Spanish (US)",
  et: "Estonian",
  fa: "Persian",
  fo: "Faroese",
  fr: "French",
  "fr-FR": "French (France)",
  he: "Hebrew",
  hi: "Hindi",
  hr: "Croatian",
  hu: "Hungarian",
  hy: "Armenian",
  id: "Indonesian",
  it: "Italian",
  "it-IT": "Italian (Italy)",
  ko: "Korean",
  lt: "Lithuanian",
  lv: "Latvian",
  nb: "Norwegian Bokmål",
  nl: "Dutch",
  pl: "Polish",
  pt: "Portuguese",
  "pt-BR": "Portuguese (Brazil)",
  "pt-PT": "Portuguese (Portugal)",
  ro: "Romanian",
  ru: "Russian",
  sh: "Serbo-Croatian",
  sk: "Slovak",
  sl: "Slovenian",
  sq: "Albanian",
  sr: "Serbian",
  sv: "Swedish",
  ta: "Tamil",
  tg: "Tajik",
  tr: "Turkish",
  uk: "Ukrainian",
  vi: "Vietnamese"
};

/**
 * Codes upstream remaps to a working variant when the requested code is not
 * directly available. Verbatim from upstream.
 */
export const LANGUAGE_REDIRECT_MAP: Record<string, string> = {
  es: "es-MX",
  "es-419": "es-MX",
  "es-ES": "es-AR"
};

/** Default for the global spell-checker enabled flag (mirrors upstream). */
export const SPELLCHECKER_ENABLED_DEFAULT = true;

/** Display name for a code — the table entry, or the bare code if unknown. Pure. */
export function languageName(code: string): string {
  return LANGUAGES[code] ?? code;
}

/** Turn a raw code into a {@link Language} descriptor. Pure. */
export function toLanguage(code: string): Language {
  return { code, name: languageName(code) };
}

/**
 * Resolve a requested code against the available codes. Returns the code to
 * use, or `undefined` when neither the code, its redirect target, nor its bare
 * language tag is available. Verbatim logic from upstream `resolveLanguage`.
 * Pure.
 */
export function resolveLanguage(code: string, available: readonly string[]): string | undefined {
  if (LANGUAGE_REDIRECT_MAP[code]) {
    const working = LANGUAGE_REDIRECT_MAP[code];
    return available.includes(working) ? working : code;
  }
  const fallback = code.split("-")[0] ?? code;
  if (available.includes(code)) return code;
  if (available.includes(fallback)) return fallback;
  return undefined;
}

/**
 * Resolve a list of requested codes against the available set, dropping any
 * that resolve to nothing. Pure (mirrors the upstream `enabledLanguages` /
 * `setLanguages` resolution).
 */
export function resolveEnabledCodes(codes: readonly string[], available: readonly string[]): string[] {
  return codes
    .map((code) => resolveLanguage(code, available))
    .filter((c): c is string => Boolean(c));
}

/** Sort a list of languages by display name (locale-aware). Non-mutating. Pure. */
export function sortLanguages(list: readonly Language[]): Language[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}