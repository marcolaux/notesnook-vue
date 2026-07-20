/**
 * Account context — the "whose data are we looking at" selector.
 *
 * The app keeps a separate encrypted SQLite database (and keychain key, and
 * NNStorage IndexedDB, and — Phase 3 — attachments dir) per *context*. A
 * context is either:
 *  - `"local"` — the local-only mode (no account; used when the user picks
 *    "Continue without account", and the place you land after logging out), or
 *  - an account context, identified by a short hash of the account's email
 *    (`hashEmail`). Hashing the email (not the server-assigned user id) lets us
 *    derive the context id *before* authenticating, so the account DB can be
 *    opened and `authenticatePassword` can write the token into it directly —
 *    the local DB is never authenticated, which is what keeps local and account
 *    data strictly separate (the user's "keep separate" choice).
 *
 * The current context is persisted in `localStorage` (`notesnook.currentContext`)
 * and read at the very start of `bootstrap()` so the right DB opens before
 * `db.init()`. Switching context is a reload (persist + reload + bootstrap opens
 * the new context's DB), except login, which live-swaps the singleton to the
 * account DB just long enough to authenticate, then reloads.
 *
 * This module is pure (no `db`, no Electron bridge) so its helpers are
 * headless-testable. Only `hashEmail` is async (Web Crypto); the rest are
 * synchronous pure functions over strings.
 */

/** A context id: `"local"` or a 16-hex-char email hash. */
export type ContextId = string;

/** The local-only context id. */
export const LOCAL_CONTEXT = "local";

/** localStorage key holding the current context id. */
export const CURRENT_CONTEXT_KEY = "notesnook.currentContext";

/** Length of the hex digest used as an account context id (first N chars of SHA-256). */
const CONTEXT_HASH_LEN = 16;

/** True for the local-only context id. */
export function isLocal(id: ContextId): boolean {
  return id === LOCAL_CONTEXT;
}

/**
 * Derive a stable, collision-resistant context id from an email address.
 * Normalises (trim + lower-case) before hashing so `Foo@Bar.com` and
 * `foo@bar.com ` map to the same account. Returns the first
 * {@link CONTEXT_HASH_LEN} hex chars of SHA-256 — enough to avoid collisions
 * for any realistic number of accounts while staying filename-safe.
 */
export async function hashEmail(email: string): Promise<ContextId> {
  const normalised = email.trim().toLowerCase();
  const data = new TextEncoder().encode(normalised);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, CONTEXT_HASH_LEN);
}

// --- Per-context name derivations (pure) ----------------------------------
//
// These map a context id to the concrete names the storage layers use. Central
// here so a context's DB file, keychain key, IndexedDB name, and attachments
// dir all derive from one id and can never drift apart.

/** SQLite filename (without the `.sql` suffix the main side appends). */
export function dbFileName(id: ContextId): string {
  return `notesnook-${id}`;
}

/** NNStorage IndexedDB database name. */
export function indexedDBName(id: ContextId): string {
  return `Notesnook-${id}`;
}

/** Attachments directory name (under `userData`). Phase 3 wires this. */
export function attachmentsDirName(id: ContextId): string {
  return `attachments-${id}`;
}

/**
 * OS-keychain key for a named secret scoped to a context. Unifies the
 * `databaseKey`, `userEncryptionKey`, and (Phase 2) per-account token cache
 * under one namespacing scheme so every keychain entry is per-context.
 */
export function keychainKey(name: string, id: ContextId): string {
  return `${name}:${id}`;
}

// --- Current-context pointer (localStorage) -------------------------------

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage !== "undefined" ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

/** Read the persisted current context id. Defaults to `"local"`. */
export function readCurrentContext(): ContextId {
  const ls = safeLocalStorage();
  if (!ls) return LOCAL_CONTEXT;
  const v = ls.getItem(CURRENT_CONTEXT_KEY);
  return v && v.trim() !== "" ? v : LOCAL_CONTEXT;
}

/** Persist the current context id (so the next boot opens its DB). */
export function writeCurrentContext(id: ContextId): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  ls.setItem(CURRENT_CONTEXT_KEY, id);
}

/**
 * Decision helper for the one-time legacy-DB → local migration. Returns whether
 * the legacy single DB (`notesnook.sql`, from before per-context support) should
 * be adopted as the local context's DB: only when the local file is absent but
 * the legacy file is present (so we don't clobber an existing local DB, and we
 * only migrate once). The actual file move is main-side; the keychain copy is
 * renderer-side (see `bootstrap.ts`).
 *
 * @param localFileExists does `notesnook-local.sql` already exist?
 * @param legacyFileExists does the legacy `notesnook.sql` exist?
 */
export function shouldMigrateLegacyToLocal(
  localFileExists: boolean,
  legacyFileExists: boolean
): boolean {
  return !localFileExists && legacyFileExists;
}