/**
 * M7 NNStorage verification — exercises the real `NNStorage` (sodium-backed
 * `NNCrypto` + in-memory KV) in node, both in isolation and as the `IStorage`
 * for a full `db.init()` + notes round-trip. Proves the crypto delegation and
 * that NNStorage satisfies `@notesnook/core`'s `IStorage` contract for the
 * pipeline (replacing the de-risk stub).
 *
 * Uses `persistence: "memory"` (MemoryKVStore) so no IndexedDB is needed in node.
 */
import { describe, it, expect } from "vitest";
import { SqliteDialect } from "@streetwriters/kysely";
import BetterSqlite from "better-sqlite3-multiple-ciphers";
import { gzipSync, gunzipSync } from "node:zlib";
import type { ICompressor, SQLiteOptions } from "@notesnook-vue/contracts";
import { NNStorage } from "../../apps/desktop/src/renderer/src/platform/storage";
import { initDatabase } from "../../apps/desktop/src/renderer/src/platform/database";
import { StubFileStorage } from "../../apps/desktop/src/renderer/src/platform/stub-fs";

class InProcessCompressor implements ICompressor {
  async compress(data: string): Promise<string> {
    return gzipSync(Buffer.from(data, "utf-8"), { level: 6 }).toString("base64");
  }
  async decompress(data: string): Promise<string> {
    return gunzipSync(Buffer.from(data, "base64")).toString("utf-8");
  }
}

describe("M7: NNStorage crypto (sodium via NNCrypto)", () => {
  it("generateCryptoKey + encrypt/decrypt round-trip", async () => {
    const storage = new NNStorage("test", () => null, "memory");
    // No salt → NNCrypto generates a SALTBYTES salt. (A caller-provided salt
    // must be base64 of crypto_pwhash_SALTBYTES bytes.)
    const key = await storage.generateCryptoKey("hunter2");
    expect(key.key).toBeDefined();
    expect(key.salt).toBeDefined();

    const cipher = await storage.encrypt(key, "secret note body");
    expect(cipher.cipher).not.toBe("secret note body");
    expect(cipher.iv).toBeDefined();
    expect(cipher.format).toBe("base64");

    const plain = await storage.decrypt(key, cipher);
    expect(plain).toBe("secret note body");
  });

  it("encryptMulti/decryptMulti round-trip", async () => {
    const storage = new NNStorage("test", () => null, "memory");
    const key = await storage.generateCryptoKey("pw");
    const ciphers = await storage.encryptMulti(key, ["one", "two", "three"]);
    expect(ciphers.length).toBe(3);
    const plain = await storage.decryptMulti(key, ciphers);
    expect(plain).toEqual(["one", "two", "three"]);
  });

  it("hash is stable and salted", async () => {
    const storage = new NNStorage("test", () => null, "memory");
    const h1 = await storage.hash("password", "user@example.com");
    const h2 = await storage.hash("password", "user@example.com");
    const h3 = await storage.hash("password", "other@example.com");
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it("KV ops (read/write/remove/getAllKeys)", async () => {
    const storage = new NNStorage("test", () => null, "memory");
    await storage.write("k", { v: 1 });
    const got = await storage.read<{ v: number }>("k");
    expect(got?.v).toBe(1);
    const keys = await storage.getAllKeys();
    expect(keys).toContain("k");
    await storage.remove("k");
    expect(await storage.read("k")).toBeUndefined();
  });
});

describe("M7: db.init() + notes round-trip with real NNStorage", () => {
  it("initialises the Database with NNStorage (memory) and round-trips a note", async () => {
    const dbInstance = new BetterSqlite(":memory:");
    dbInstance.unsafeMode(true);
    const platform: {
      sqliteOptions: SQLiteOptions;
      storage: NNStorage;
      fs: StubFileStorage;
      compressor: InProcessCompressor;
    } = {
      sqliteOptions: {
        dialect: () => new SqliteDialect({ database: dbInstance }),
        journalMode: "WAL",
        synchronous: "normal",
        lockingMode: "exclusive",
        tempStore: "memory",
        cacheSize: -32000,
        pageSize: 8192
      },
      storage: new NNStorage("nnvue-test", () => null, "memory"),
      fs: new StubFileStorage(),
      compressor: new InProcessCompressor()
    };

    const db = await initDatabase(platform);
    const id = await db.notes.add({ title: "With real storage" });
    expect(await db.notes.all.count()).toBe(1);
    const note = await db.notes.note(id);
    expect(note?.title).toBe("With real storage");
  });
});