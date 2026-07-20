/**
 * Renderer key store — manages the `databaseKey`, the key that encrypts the
 * local SQLite database (`PRAGMA key`). The key is 32 random bytes, generated
 * once on first run (per context) and persisted encrypted via Main's
 * `safeStorage` (OS keychain). On every subsequent boot the same key is
 * retrieved so the existing encrypted DB can be reopened.
 *
 * Per-account support: each *context* (local mode, or a logged-in account) has
 * its own `databaseKey` (and `userEncryptionKey`) in the keychain, namespaced
 * via {@link keychainKey} so contexts never share keys. A context's DB file is
 * encrypted with its own key; switching context swaps both the file and the
 * key (see `account-context.ts` + `bootstrap.ts`).
 *
 * Uses Web Crypto + btoa/atob only — no Node `Buffer` (the renderer runs with
 * nodeIntegration disabled).
 *
 * This is the minimal Phase 1 slice: a per-context bootstrap secret. The full
 * upstream `KeyStore` (multi-credential app-lock, wrapping keys, PGP) is
 * Phase 6 scope.
 */
import { desktop } from "./desktop-bridge";
import { keychainKey, type ContextId, LOCAL_CONTEXT } from "./account-context";

const DATABASE_KEY = "databaseKey";

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] as number);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/**
 * Returns the persisted `databaseKey` for a context, generating + storing a
 * fresh 32-byte key on first run. Throws if `safeStorage` is unavailable and
 * no key exists yet (the Main side falls back to plain storage with a warning,
 * so this is only a hard failure when the bridge itself is down).
 *
 * Per-context: the keychain entry is `databaseKey:<contextId>`, so each
 * context's DB is encrypted with its own key.
 */
export async function getDatabaseKey(contextId: ContextId = LOCAL_CONTEXT): Promise<Uint8Array> {
  const keychainKeyId = keychainKey(DATABASE_KEY, contextId);
  const existing = await desktop.safeStorage.get.query({ key: keychainKeyId });
  if (existing) return base64ToBytes(existing);

  const key = crypto.getRandomValues(new Uint8Array(32));
  await desktop.safeStorage.set.mutate({ key: keychainKeyId, value: bytesToBase64(key) });
  return key;
}

/** The SQLite cipher password (hex of the raw key bytes) for `PRAGMA key`. */
export function databaseKeyToPassword(key: Uint8Array): string {
  return bytesToHex(key);
}

/**
 * One-time legacy keychain migration: before per-context support there was a
 * single global `databaseKey` encrypting the single `notesnook.sql`. When
 * adopting that legacy DB as the local context's DB (`notesnook-local.sql`,
 * renamed main-side), the matching keychain entry must move from `databaseKey`
 * to `databaseKey:local` so `getDatabaseKey("local")` retrieves it. Idempotent
 * — a no-op once the per-context key exists or the legacy key is gone.
 */
export async function migrateLegacyDatabaseKeyIfNeeded(
  contextId: ContextId = LOCAL_CONTEXT
): Promise<void> {
  const targetKey = keychainKey(DATABASE_KEY, contextId);
  const existing = await desktop.safeStorage.get.query({ key: targetKey });
  if (existing) return; // per-context key already present
  const legacy = await desktop.safeStorage.get.query({ key: DATABASE_KEY });
  if (!legacy) return; // nothing to migrate (fresh install)
  await desktop.safeStorage.set.mutate({ key: targetKey, value: legacy });
  await desktop.safeStorage.remove.mutate({ key: DATABASE_KEY });
}

/**
 * Minimal secret store for the `userEncryptionKey` (and any other small
 * secrets NNStorage needs), backed by Main's `safeStorage` (OS keychain).
 * This is the Phase 1 slice of upstream's `IKeyStore` — just get/set string
 * secrets; the multi-credential app-lock system is Phase 6.
 *
 * Per-context: every key is namespaced with the context id (`<key>:<contextId>`)
 * so `userEncryptionKey` and any other secret is scoped to the context, never
 * shared across accounts / local mode.
 */
export interface IKeyStore {
  getValue(key: string): Promise<string | undefined>;
  setValue(key: string, value: string): Promise<void>;
}

export class SafeStorageKeyStore implements IKeyStore {
  constructor(private readonly contextId: ContextId = LOCAL_CONTEXT) {}

  async getValue(key: string): Promise<string | undefined> {
    return desktop.safeStorage.get.query({ key: keychainKey(key, this.contextId) });
  }
  async setValue(key: string, value: string): Promise<void> {
    await desktop.safeStorage.set.mutate({ key: keychainKey(key, this.contextId), value });
  }
}