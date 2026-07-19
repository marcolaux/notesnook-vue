/*
NNStorage — the `@notesnook/core` `IStorage` implementation for desktop. Ported
from upstream `apps/web/src/interfaces/storage.ts` (GPL-3.0), trimmed to the
`IStorage` surface (KV + sodium crypto). The upstream PGP methods
(generatePGPKeyPair / validatePGPKeyPair / decryptPGPMessage) are NOT in
`IStorage` — they belong to the sharing/Monograph feature (Phase 6) and are
omitted here, which also avoids the `openpgp` + `@notesnook/intl` dependencies.

KV is backed by `IndexedDBKVStore` (renderer has IndexedDB); crypto by
`NNCrypto` (sodium); the `userEncryptionKey` is held by the `IKeyStore` (Main
`safeStorage`).
*/
import type { IStorage } from "@notesnook-vue/contracts";
import type { Cipher, SerializedKey } from "@notesnook-vue/contracts";
import {
  IndexedDBKVStore,
  MemoryKVStore,
  type IKVStore
} from "./key-value";
import { NNCrypto } from "./nncrypto";
import type { IKeyStore } from "./key-store";

export type DatabasePersistence = "memory" | "db";

const APP_SALT = "oVzKtazBo7d8sb7TBvY9jw";

export class NNStorage implements IStorage {
  database: IKVStore;

  constructor(
    name: string,
    private readonly keyStore: () => IKeyStore | null = () => null,
    persistence: DatabasePersistence = "db"
  ) {
    this.database =
      persistence === "memory"
        ? new MemoryKVStore()
        : new IndexedDBKVStore(name, "keyvaluepairs");
  }

  read<T>(key: string): Promise<T | undefined> {
    if (!key) return Promise.resolve(undefined);
    return this.database.get<T>(key);
  }

  readMulti<T>(keys: string[]): Promise<[string, T][]> {
    if (keys.length <= 0) return Promise.resolve([]);
    return this.database.getMany<T>(keys.sort());
  }

  writeMulti<T>(entries: [string, T][]): Promise<void> {
    return this.database.setMany(entries);
  }

  write<T>(key: string, data: T): Promise<void> {
    return this.database.set(key, data);
  }

  remove(key: string): Promise<void> {
    return this.database.delete(key);
  }

  removeMulti(keys: string[]): Promise<void> {
    return this.database.deleteMany(keys);
  }

  clear(): Promise<void> {
    return this.database.clear();
  }

  getAllKeys(): Promise<string[]> {
    return this.database.keys();
  }

  async deriveCryptoKey(credentials: SerializedKey): Promise<void> {
    const store = this.keyStore();
    if (!store) throw new Error("No key store found!");

    const { password, salt } = credentials;
    if (!password) throw new Error("Invalid data provided to deriveCryptoKey.");

    const keyData = await NNCrypto.exportKey(password, salt);
    if (!keyData.key) throw new Error("Invalid key.");

    await store.setValue("userEncryptionKey", keyData.key);
  }

  async getCryptoKey(): Promise<string | undefined> {
    const store = this.keyStore();
    if (!store) throw new Error("No key store found!");
    return store.getValue("userEncryptionKey");
  }

  async generateCryptoKey(password: string, salt?: string): Promise<SerializedKey> {
    if (!password) throw new Error("Invalid data provided to generateCryptoKey.");
    return NNCrypto.exportKey(password, salt);
  }

  async hash(password: string, email: string): Promise<string> {
    return NNCrypto.hash(password, `${APP_SALT}${email}`);
  }

  encrypt(key: SerializedKey, plainText: string): Promise<Cipher<"base64">> {
    return NNCrypto.encrypt(key, plainText, "text", "base64");
  }

  encryptMulti(key: SerializedKey, items: string[]): Promise<Cipher<"base64">[]> {
    return NNCrypto.encryptMulti(key, items, "text", "base64");
  }

  decrypt(key: SerializedKey, cipherData: Cipher<"base64">): Promise<string> {
    cipherData.format = "base64";
    return NNCrypto.decrypt(key, cipherData, "text");
  }

  decryptMulti(key: SerializedKey, items: Cipher<"base64">[]): Promise<string[]> {
    for (const c of items) c.format = "base64";
    return NNCrypto.decryptMulti(key, items, "text");
  }
}