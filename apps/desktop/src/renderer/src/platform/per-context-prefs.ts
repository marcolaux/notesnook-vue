/**
 * Per-context (per-account) client preferences — a localStorage namespace
 * layer that keys client-only settings by `ContextId` so each account keeps
 * its own value on this device.
 *
 * The app has a two-tier settings convention (see `stores/config.ts` +
 * `stores/settings.ts`): `db.settings` is upstream-synced and per-account
 * (each context opens its own encrypted SQLite); `localStorage` is client-only
 * and historically *device-global* (one shared origin, no session partition).
 * This module introduces a third tier — **client-only AND per-account** — for
 * preferences that should follow the account on this device but not sync
 * (theme, locale, default templates, semantic-search toggle, block-colorize).
 *
 * Key shape: `notesnook.<base>.<ctx>` where `<ctx>` is `LOCAL_CONTEXT`
 * (`"local"`) or the 16-hex-char email hash. The legacy un-suffixed key
 * (`notesnook.<base>`) is the pre-per-account value; reads fall back to it so
 * an upgrading user's existing preference carries forward to whichever account
 * reads first (lazy migration — `migrateLegacyToCtx` copies it into the ctx
 * key on first contact). Writes always go to the ctx-suffixed key; the legacy
 * key is left in place (harmless — reads always prefer the ctx key).
 *
 * Pure + headless-testable: callers pass `ctx` explicitly (no
 * `getCurrentContext()` inside), and all `localStorage` access is guarded so
 * the module imports cleanly in the Node test env.
 */
import { LOCAL_CONTEXT } from "@/platform/account-context";

/** Build the ctx-suffixed localStorage key for `base` under context `ctx`. */
export function ctxKey(base: string, ctx: string): string {
  return `${base}.${ctx}`;
}

/** Read the ctx-suffixed value, or `null` if absent. Does NOT consult the
 *  legacy un-suffixed key — use `readCtxStringWithLegacy` for that. */
export function readCtxString(base: string, ctx: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(ctxKey(base, ctx));
  } catch {
    return null;
  }
}

/** Write the ctx-suffixed value (best-effort; persistence is optional). */
export function writeCtxString(base: string, ctx: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(ctxKey(base, ctx), value);
  } catch {
    /* best-effort */
  }
}

/** Remove the ctx-suffixed value (best-effort). */
export function removeCtxKey(base: string, ctx: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(ctxKey(base, ctx));
  } catch {
    /* best-effort */
  }
}

/** Read with legacy fallback: try the ctx-suffixed key first, then the legacy
 *  un-suffixed key. `fromLegacy` is true iff the value came from the legacy
 *  key (so callers can opt to migrate-write it into the ctx key). */
export function readCtxStringWithLegacy(
  base: string,
  ctx: string
): { value: string | null; fromLegacy: boolean } {
  const ctxValue = readCtxString(base, ctx);
  if (ctxValue !== null) return { value: ctxValue, fromLegacy: false };
  try {
    if (typeof localStorage === "undefined") return { value: null, fromLegacy: false };
    const legacy = localStorage.getItem(base);
    return { value: legacy, fromLegacy: legacy !== null };
  } catch {
    return { value: null, fromLegacy: false };
  }
}

/** One-time lazy migration: if the ctx key is absent AND the legacy
 *  un-suffixed key is present, copy the legacy value into the ctx key.
 *  Idempotent — a no-op once the ctx key exists or the legacy key is gone.
 *  Returns true iff it wrote (migrated). */
export function migrateLegacyToCtx(base: string, ctx: string): boolean {
  const { value, fromLegacy } = readCtxStringWithLegacy(base, ctx);
  if (!fromLegacy || value === null) return false;
  writeCtxString(base, ctx, value);
  return true;
}

/** Result of matching a `storage` event key against a set of known base keys.
 *  `ctx` is the suffix context id, or `null` for a legacy un-suffixed key. */
export interface CtxKeyMatch {
  base: string;
  ctx: string | null;
}

/** A plausible context id: the local-only id or a 16-hex-char email hash
 *  (see `account-context.ts` `hashEmail`). Used to reject suffixes that are
 *  not real context ids — e.g. so `notesnook.theme.dark.<hex>` does NOT match
 *  a shorter base `notesnook.theme` (whose suffix `dark.<hex>` is not a ctx). */
export function isCtxId(value: string): boolean {
  return value === LOCAL_CONTEXT || /^[0-9a-f]{16}$/.test(value);
}

/** Match a `storage` event key against a set of known base keys. Returns the
 *  matched base + ctx suffix, or `null` if `key` matches none of `bases`.
 *  - `ctx === null` → the key is exactly `base` (legacy un-suffixed write).
 *  - `ctx === "<id>"` → the key is `base + "." + <id>` (per-context write).
 *
 *  Unambiguous because a suffixed match requires the suffix to be a valid
 *  context id (`isCtxId`); a base is only treated as a prefix when what
 *  follows the `.` is `local` or a 16-hex hash, so a base that happens to be a
 *  string-prefix of another base (e.g. `notesnook.theme` vs
 *  `notesnook.theme.dark`) never swallows the longer key. */
export function matchCtxKey(key: string, bases: string[]): CtxKeyMatch | null {
  for (const base of bases) {
    if (key === base) return { base, ctx: null };
    const prefix = base + ".";
    if (key.startsWith(prefix)) {
      const ctx = key.slice(prefix.length);
      if (isCtxId(ctx)) return { base, ctx };
    }
  }
  return null;
}

/** Re-exported so callers can reference the local context id without a second
 *  import. */
export { LOCAL_CONTEXT };