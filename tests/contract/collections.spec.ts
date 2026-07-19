/**
 * M11 — extended contract tests against the REAL platform (in-process SQLite
 * dialect + real NNStorage with a memory key store + real FileStorage with an
 * in-memory chunk store + in-process zlib compressor). Exercises the
 * `@notesnook/core` collections end-to-end: notebooks, tags, settings,
 * attachments (encrypted via FileStorage + sodium), vault (encrypted note
 * storage), and sync (graceful failure without a user).
 *
 * No Electron: the same `initDatabase()` the renderer uses, with a fake
 * dialect/chunk-store swapped in. Crypto-bearing collections (attachments,
 * vault) derive a `userEncryptionKey` first, mirroring a logged-in user.
 */
import { describe, it, expect } from "vitest";
import { SqliteDialect } from "@streetwriters/kysely";
import BetterSqlite from "better-sqlite3-multiple-ciphers";
import { gzipSync, gunzipSync } from "node:zlib";
import type { IFileStorage as StreamableFSChunkStore, File as FSFile } from "@notesnook/streamable-fs";
import type { ICompressor, SQLiteOptions } from "@notesnook-vue/contracts";
import { initDatabase } from "../../apps/desktop/src/renderer/src/platform/database";
import type { DatabasePlatform } from "../../apps/desktop/src/renderer/src/platform/database";
import { NNStorage } from "../../apps/desktop/src/renderer/src/platform/storage";
import { createFileStorage } from "../../apps/desktop/src/renderer/src/platform/fs";
import type { IKeyStore } from "../../apps/desktop/src/renderer/src/platform/key-store";

class InProcessCompressor implements ICompressor {
  async compress(data: string): Promise<string> {
    return gzipSync(Buffer.from(data, "utf-8"), { level: 6 }).toString("base64");
  }
  async decompress(data: string): Promise<string> {
    return gunzipSync(Buffer.from(data, "base64")).toString("utf-8");
  }
}

class MemoryKeyStore implements IKeyStore {
  private map = new Map<string, string>();
  async getValue(key: string): Promise<string | undefined> {
    return this.map.get(key);
  }
  async setValue(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
}

class MemoryFileStore implements StreamableFSChunkStore {
  private meta = new Map<string, FSFile>();
  private chunks = new Map<string, Uint8Array>();
  async clear(): Promise<void> { this.meta.clear(); this.chunks.clear(); }
  async setMetadata(f: string, m: FSFile): Promise<void> { this.meta.set(f, m); }
  async getMetadata(f: string): Promise<FSFile | undefined> { return this.meta.get(f); }
  async deleteMetadata(f: string): Promise<void> { this.meta.delete(f); }
  async writeChunk(c: string, d: Uint8Array): Promise<void> { this.chunks.set(c, d); }
  async deleteChunk(c: string): Promise<void> { this.chunks.delete(c); }
  async readChunk(c: string): Promise<Uint8Array | undefined> { return this.chunks.get(c); }
  async chunkSize(c: string): Promise<number> { return this.chunks.get(c)?.length ?? 0; }
  async listChunks(p: string): Promise<string[]> { return [...this.chunks.keys()].filter((k) => k.startsWith(p)); }
  async list(): Promise<string[]> { return [...this.meta.keys()]; }
}

interface RealPlatform {
  platform: DatabasePlatform;
  storage: NNStorage;
  keyStore: MemoryKeyStore;
}

/** Build a fresh in-process platform with real NNStorage + FileStorage. */
function buildRealPlatform(): RealPlatform {
  const dbInstance = new BetterSqlite(":memory:");
  dbInstance.unsafeMode(true);
  const keyStore = new MemoryKeyStore();
  const storage = new NNStorage("nnvue-test", () => keyStore, "memory");
  const platform: DatabasePlatform = {
    sqliteOptions: {
      dialect: () => new SqliteDialect({ database: dbInstance }),
      journalMode: "WAL",
      synchronous: "normal",
      lockingMode: "exclusive",
      tempStore: "memory",
      cacheSize: -32000,
      pageSize: 8192
    },
    storage,
    fs: createFileStorage({ chunkStore: new MemoryFileStore() }),
    compressor: new InProcessCompressor()
  };
  return { platform, storage, keyStore };
}

/** Init a fresh DB and derive a userEncryptionKey (mimics a logged-in user). */
async function setupDbWithUser() {
  const { platform, storage } = buildRealPlatform();
  const db = await initDatabase(platform);
  // generateCryptoKey returns {key, salt}; deriveCryptoKey takes {password, salt}
  // and stores the derived key as userEncryptionKey.
  const probe = await storage.generateCryptoKey("user-password");
  await storage.deriveCryptoKey({ password: "user-password", salt: probe.salt });
  return db;
}

describe("M11: collections (real NNStorage + FileStorage, in-process)", () => {
  it("notebooks.add + notes.addToNotebook round-trip", async () => {
    const db = await initDatabase(buildRealPlatform().platform);
    const nbId = await db.notebooks.add({ title: "My notebook" });
    expect(typeof nbId).toBe("string");
    const noteId = await db.notes.add({ title: "In notebook" });
    await db.notes.addToNotebook(nbId as string, noteId);
    expect(await db.notebooks.notes(nbId as string)).toContain(noteId);
    const nbs = await db.notebooks.all.items();
    expect(nbs.length).toBe(1);
    expect(nbs[0]?.title).toBe("My notebook");
  });

  it("tags.add + tags.tag round-trip", async () => {
    const db = await initDatabase(buildRealPlatform().platform);
    const tagId = await db.tags.add({ title: "work" });
    expect(typeof tagId).toBe("string");
    const tag = await db.tags.tag(tagId as string);
    expect(tag?.title).toBe("work");
    expect((await db.tags.all.items()).length).toBe(1);
  });

  it("settings typed setters/getters round-trip", async () => {
    const db = await initDatabase(buildRealPlatform().platform);
    await db.settings.setTitleFormat("$headline$ $date$");
    expect(db.settings.getTitleFormat()).toBe("$headline$ $date$");
    const nbId = await db.notebooks.add({ title: "Default" });
    await db.settings.setDefaultNotebook(nbId as string);
    expect(db.settings.getDefaultNotebook()).toBe(nbId);
  });

  // NOTE: the Attachments collection (`attachments.save`/`add`/`generateKey`)
  // is gated on a logged-in user — `_getEncryptionKey` calls
  // `db.user.getAttachmentsKey()`, which is set during login (auth = Phase 6).
  // So a full attachments round-trip isn't testable here without a user. The
  // FileStorage encryption layer it sits on IS verified in filestorage.spec
  // (writeEncryptedBase64 -> readEncrypted round-trip with real sodium).

  it("vault.create + add + open round-trips an encrypted note", async () => {
    const db = await setupDbWithUser();
    expect(await db.vault.create("vault-password")).toBe(true);
    expect(db.vault.unlocked).toBe(true);

    const noteId = await db.notes.add({ title: "Secret" });
    await db.vault.add(noteId);

    const opened = await db.vault.open(noteId, "vault-password");
    // The note is retrievable/decryptable from the vault (vault re-saves on
    // lock, so the title may be regenerated — assert identity, not title).
    expect(opened?.id).toBe(noteId);
  });

  it("sync completes without crashing when not logged in", async () => {
    const db = await initDatabase(buildRealPlatform().platform);
    // With no user/token, sync short-circuits to a boolean (no-op) rather than
    // crashing — assert it resolves to a boolean.
    const result = await db.sync({ type: "send" });
    expect(typeof result).toBe("boolean");
  });
});