/**
 * Process-agnostic i18n (Phase 7.2) — a tiny, dependency-free translator
 * shared by the Electron main process and the renderer. The renderer wraps the
 * locale catalogs in vue-i18n (Composition API) for reactivity; the main
 * process uses {@link translate} directly (it cannot host a Vue plugin).
 * Keeping the catalogs + translator in `contracts/` (the existing shared dir,
 * imported via `../contracts/...` from main and `@contracts/...` from the
 * renderer) means a single source of truth so the two processes never drift.
 *
 * Parity with vue-i18n v11: `{param}` interpolation + the `|`-separated plural
 * form selected by a numeric `n` param (the array form `["one","many"]` is a
 * NOOP in composition `t`, so the codebase uses the `|` form — see the
 * `contextMenu.moveToTrashConfirm` key). {@link translate} mirrors that so a
 * translated catalog's `|`-forms work identically in main.
 *
 * `LOCALES` starts as `["en","pseudo"]` and grows as real locales are seeded
 * (German `de` lands in Batch 3 of Phase 7.2). The shared `toPseudo` lets the
 * main process build the same pseudo catalog the renderer uses, so dev sweeps
 * cover OS-level chrome too.
 */
import en from "./en";

export { default as en } from "./en";

/** Locales shipped with the app. `pseudo` is a dev affordance, not a real one.
 *  Real locales are appended here as their catalog files land. */
export const LOCALES = ["en", "pseudo"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const PSEUDO_LOCALE: Locale = "pseudo";

/** A locale catalog is the shape of `en` (possibly sparse — missing keys fall
 *  back to `en` per-key, mirroring vue-i18n `fallbackLocale`). */
export type Messages = typeof en;

/** Recursively wrap every string leaf of a message catalog in guillemets.
 *  The renderer's `pseudo` locale is `toPseudo(en)` so untranslated strings are
 *  visibly obvious in dev. Shared here so the main process can build the same
 *  pseudo catalog for its surfaces (menu / tray / window titles). */
export function toPseudo<T>(messages: T): T {
  if (typeof messages === "string") return `⟪${messages}⟫` as unknown as T;
  if (Array.isArray(messages)) return messages.map((m) => toPseudo(m)) as unknown as T;
  if (messages && typeof messages === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(messages as Record<string, unknown>)) out[k] = toPseudo(v);
    return out as unknown as T;
  }
  return messages;
}

/** Resolve a dotted key path (`a.b.c`) against a nested object; returns
 *  `undefined` on any miss. Array leaves are returned as-is. */
function lookup(obj: unknown, key: string): unknown {
  if (obj == null) return undefined;
  const parts = key.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Replace `{name}` tokens with `params[name]`; unknown tokens are left as-is. */
function interpolate(str: string, params?: Record<string, unknown>): string {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in params ? String(params[name]) : `{${name}}`
  );
}

/** Select the `|`-plural form by a numeric `n` param (mirrors vue-i18n v11
 *  `t(key, n)`). English/German are two-form (one | other): index 0 when
 *  `n === 1`, else 1. A non-`|` leaf is returned unchanged. */
function selectPlural(leaf: string, params?: Record<string, unknown>): string {
  if (!leaf.includes("|")) return leaf;
  const parts = leaf.split("|");
  const n = params?.n;
  const idx = typeof n === "number" && n === 1 ? 0 : 1;
  return (parts[idx] ?? parts[parts.length - 1] ?? leaf).trim();
}

/** Translate `key` for `locale` against a `messages` map (`{ en, de, … }`),
 *  falling back to `en` per-key when the active locale's leaf is missing.
 *  Interpolates `{param}` + selects `|`-plural by a numeric `n` param. Returns
 *  the key path itself when nothing resolves (so a miss is visible, not
 *  silent — same convention vue-i18n uses when `fallbackWarn` is off). */
export function translate(
  messages: Partial<Record<Locale, Messages>>,
  locale: Locale,
  key: string,
  params?: Record<string, unknown>
): string {
  let leaf = lookup(messages[locale], key);
  if (leaf === undefined && locale !== DEFAULT_LOCALE) {
    leaf = lookup(messages[DEFAULT_LOCALE], key);
  }
  if (typeof leaf !== "string") return key;
  return interpolate(selectPlural(leaf, params), params);
}

/** Resolve an array message (e.g. `reminder.weekdays`) → the array, falling
 *  back to `en`. Returns `undefined` on miss / non-array. The renderer uses
 *  vue-i18n's `tm()` for this; main uses this helper when it needs an array. */
export function translateMessage(
  messages: Partial<Record<Locale, Messages>>,
  locale: Locale,
  key: string
): unknown[] | undefined {
  let leaf = lookup(messages[locale], key);
  if (leaf === undefined && locale !== DEFAULT_LOCALE) {
    leaf = lookup(messages[DEFAULT_LOCALE], key);
  }
  return Array.isArray(leaf) ? leaf : undefined;
}