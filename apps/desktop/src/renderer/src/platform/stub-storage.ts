/**
 * Stub `IStorage` for the de-risk Gate — in-memory KV with crypto methods that
 * throw. Sufficient for `db.init()` / `initCollections()` with no logged-in user
 * (KV reads return undefined; crypto/fs are not touched). Replaced by the real
 * `NNStorage` (M7) once the pipeline is proven.
 */
import type { IStorage } from "@notesnook-vue/contracts";
import type { Cipher, SerializedKey } from "@notesnook-vue/contracts";

function notImplemented(name: string): never {
  throw new Error(`StubStorage.${name}() not implemented (M7 will provide real crypto)`);
}

export class StubStorage implements IStorage {
  private readonly map = new Map<string, unknown>();

  async write<T>(key: string, data: T): Promise<void> {
    this.map.set(key, data);
  }
  async writeMulti<T>(entries: [string, T][]): Promise<void> {
    for (const [k, v] of entries) this.map.set(k, v);
  }
  async readMulti<T>(keys: string[]): Promise<[string, T][]> {
    const out: [string, T][] = [];
    for (const k of keys) {
      const v = this.map.get(k) as T | undefined;
      if (v !== undefined) out.push([k, v]);
    }
    return out;
  }
  async read<T>(key: string): Promise<T | undefined> {
    return this.map.get(key) as T | undefined;
  }
  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
  async removeMulti(keys: string[]): Promise<void> {
    for (const k of keys) this.map.delete(k);
  }
  async clear(): Promise<void> {
    this.map.clear();
  }
  async getAllKeys(): Promise<string[]> {
    return [...this.map.keys()];
  }

  // --- crypto: not needed for init with no user ---
  encrypt(_key: SerializedKey, _plainText: string): Promise<Cipher<"base64">> {
    return Promise.reject(notImplemented("encrypt"));
  }
  encryptMulti(_key: SerializedKey, _items: string[]): Promise<Cipher<"base64">[]> {
    return Promise.reject(notImplemented("encryptMulti"));
  }
  decrypt(_key: SerializedKey, _cipherData: Cipher<"base64">): Promise<string> {
    return Promise.reject(notImplemented("decrypt"));
  }
  decryptMulti(_key: SerializedKey, _items: Cipher<"base64">[]): Promise<string[]> {
    return Promise.reject(notImplemented("decryptMulti"));
  }
  deriveCryptoKey(_credentials: SerializedKey): Promise<void> {
    return Promise.reject(notImplemented("deriveCryptoKey"));
  }
  hash(_password: string, _email: string): Promise<string> {
    return Promise.reject(notImplemented("hash"));
  }
  getCryptoKey(): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }
  generateCryptoKey(_password: string, _salt?: string): Promise<SerializedKey> {
    return Promise.reject(notImplemented("generateCryptoKey"));
  }
}