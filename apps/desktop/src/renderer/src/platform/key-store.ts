/**
 * Renderer key store — manages the `databaseKey`, the key that encrypts the
 * local SQLite database (`PRAGMA key`). The key is 32 random bytes, generated
 * once on first run and persisted encrypted via Main's `safeStorage` (OS
 * keychain). On every subsequent boot the same key is retrieved so the existing
 * encrypted DB can be reopened.
 *
 * Uses Web Crypto + btoa/atob only — no Node `Buffer` (the renderer runs with
 * nodeIntegration disabled).
 *
 * This is the minimal Phase 1 slice: a single bootstrap secret. The full
 * upstream `KeyStore` (multi-credential app-lock, wrapping keys, PGP) is
 * Phase 6 scope.
 */
import { desktop } from "./desktop-bridge";

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
 * Returns the persisted `databaseKey`, generating + storing a fresh 32-byte
 * key on first run. Throws if `safeStorage` is unavailable and no key exists
 * yet (the Main side falls back to plain storage with a warning, so this is
 * only a hard failure when the bridge itself is down).
 */
export async function getDatabaseKey(): Promise<Uint8Array> {
  const existing = await desktop.safeStorage.get.query({ key: DATABASE_KEY });
  if (existing) return base64ToBytes(existing);

  const key = crypto.getRandomValues(new Uint8Array(32));
  await desktop.safeStorage.set.mutate({ key: DATABASE_KEY, value: bytesToBase64(key) });
  return key;
}

/** The SQLite cipher password (hex of the raw key bytes) for `PRAGMA key`. */
export function databaseKeyToPassword(key: Uint8Array): string {
  return bytesToHex(key);
}

/**
 * Minimal secret store for the `userEncryptionKey` (and any other small
 * secrets NNStorage needs), backed by Main's `safeStorage` (OS keychain).
 * This is the Phase 1 slice of upstream's `IKeyStore` — just get/set string
 * secrets; the multi-credential app-lock system is Phase 6.
 */
export interface IKeyStore {
  getValue(key: string): Promise<string | undefined>;
  setValue(key: string, value: string): Promise<void>;
}

export class SafeStorageKeyStore implements IKeyStore {
  async getValue(key: string): Promise<string | undefined> {
    return desktop.safeStorage.get.query({ key });
  }
  async setValue(key: string, value: string): Promise<void> {
    await desktop.safeStorage.set.mutate({ key, value });
  }
}