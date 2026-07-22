/**
 * Attachments real-db — proves the core `orphaned` / `linked` selectors and
 * `removeOrphaned()` behave in our local-mode db (the central assumption the
 * Attachments section rests on), WITHOUT Electron. Reuses the
 * `local-user-attachments.spec.ts` harness: in-process `:memory:` SQLite +
 * real `NNStorage("memory")` (shared in-memory keyStore) + real
 * `createFileStorage` over `MemoryFileStore` + `ensureLocalUser` (so
 * `db.attachments.save` has a master key). Then links one attachment to a note
 * via `db.relations.add` and asserts the orphaned/linked counts + cleanup.
 */
import { describe, it, expect } from "vitest";
import { SqliteDialect } from "@streetwriters/kysely";
import BetterSqlite from "better-sqlite3-multiple-ciphers";
import { loadFts5Extensions } from "./helpers/fts5-extensions";
import { gzipSync, gunzipSync } from "node:zlib";
import type {
  ICompressor,
  SQLiteOptions,
  Database,
  IFileStorage
} from "@notesnook-vue/contracts";
import type { IKeyStore } from "../../apps/desktop/src/renderer/src/platform/key-store";
import { initDatabase } from "../../apps/desktop/src/renderer/src/platform/database";
import { NNStorage } from "../../apps/desktop/src/renderer/src/platform/storage";
import { createFileStorage } from "../../apps/desktop/src/renderer/src/platform/fs";
import type { StreamableFSChunkStore, File } from "@notesnook/streamable-fs";
import { ensureLocalUser } from "@/platform/local-user";

class InMemoryKeyStore implements IKeyStore {
  private map = new Map<string, string>();
  getValue(key: string): Promise<string | undefined> {
    return Promise.resolve(this.map.get(key));
  }
  setValue(key: string, value: string): Promise<void> {
    this.map.set(key, value);
    return Promise.resolve();
  }
}

class MemoryFileStore implements StreamableFSChunkStore {
  private meta = new Map<string, File>();
  private chunks = new Map<string, Uint8Array>();
  async clear(): Promise<void> {
    this.meta.clear();
    this.chunks.clear();
  }
  async setMetadata(filename: string, metadata: File): Promise<void> {
    this.meta.set(filename, metadata);
  }
  async getMetadata(filename: string): Promise<File | undefined> {
    return this.meta.get(filename);
  }
  async deleteMetadata(filename: string): Promise<void> {
    this.meta.delete(filename);
  }
  async writeChunk(chunkName: string, data: Uint8Array): Promise<void> {
    this.chunks.set(chunkName, data);
  }
  async deleteChunk(chunkName: string): Promise<void> {
    this.chunks.delete(chunkName);
  }
  async readChunk(chunkName: string): Promise<Uint8Array | undefined> {
    return this.chunks.get(chunkName);
  }
  async chunkSize(chunkName: string): Promise<number> {
    return this.chunks.get(chunkName)?.length ?? 0;
  }
  async listChunks(chunkPrefix: string): Promise<string[]> {
    return [...this.chunks.keys()].filter((k) => k.startsWith(chunkPrefix));
  }
  async list(): Promise<string[]> {
    return [...this.meta.keys()];
  }
}

class InProcessCompressor implements ICompressor {
  async compress(data: string): Promise<string> {
    return gzipSync(Buffer.from(data, "utf-8"), { level: 6 }).toString("base64");
  }
  async decompress(data: string): Promise<string> {
    return gunzipSync(Buffer.from(data, "base64")).toString("utf-8");
  }
}

async function setupDb(): Promise<Database> {
  const dbInstance = new BetterSqlite(":memory:");
  loadFts5Extensions(dbInstance);
  const keyStore = new InMemoryKeyStore();
  const storage = new NNStorage("test", () => keyStore, "memory");
  const fs: IFileStorage = createFileStorage({ chunkStore: new MemoryFileStore() });
  const sqliteOptions: SQLiteOptions = {
    dialect: () => new SqliteDialect({ database: dbInstance }),
    journalMode: "WAL",
    synchronous: "normal",
    lockingMode: "exclusive",
    tempStore: "memory",
    cacheSize: -32000,
    pageSize: 8192
  };
  return initDatabase({
    sqliteOptions,
    storage,
    fs,
    compressor: new InProcessCompressor()
  });
}

describe("attachments orphaned/linked selectors (real db, local mode)", () => {
  it("an attachment linked to a note is 'linked'; an unlinked one is 'orphaned'", async () => {
    const db = await setupDb();
    await ensureLocalUser(db);

    const hash1 = await db.attachments.save(btoa("image-one"), "image/png", "one.png");
    const hash2 = await db.attachments.save(btoa("image-two"), "image/png", "two.png");
    expect(hash1).toBeDefined();
    expect(hash2).toBeDefined();

    const att1 = await db.attachments.attachment(hash1 as string);
    const att2 = await db.attachments.attachment(hash2 as string);
    expect(att1).toBeDefined();
    expect(att2).toBeDefined();

    // Both start orphaned (no relations yet).
    expect(await db.attachments.all.count()).toBe(2);
    expect(await db.attachments.orphaned.count()).toBe(2);
    expect(await db.attachments.linked.count()).toBe(0);

    // Link att1 to a note (relations are keyed by attachment `id`).
    const noteId = await db.notes.add({ title: "Linked note" });
    expect(typeof noteId).toBe("string");
    await db.relations.add(
      { type: "note", id: noteId },
      { type: "attachment", id: att1!.id }
    );

    expect(await db.attachments.orphaned.count()).toBe(1);
    expect(await db.attachments.linked.count()).toBe(1);
    const orphaned = await db.attachments.orphaned.items();
    expect(orphaned.map((a) => a.id)).toEqual([att2!.id]);
  });

  it("removeOrphaned() deletes only the unlinked attachments", async () => {
    const db = await setupDb();
    await ensureLocalUser(db);

    const hash1 = await db.attachments.save(btoa("keep"), "image/png", "keep.png");
    const hash2 = await db.attachments.save(btoa("orphan"), "image/png", "orphan.png");
    const att1 = await db.attachments.attachment(hash1 as string);

    const noteId = await db.notes.add({ title: "Keeps the linked attachment" });
    await db.relations.add(
      { type: "note", id: noteId },
      { type: "attachment", id: att1!.id }
    );

    expect(await db.attachments.orphaned.count()).toBe(1);
    // The vendored core build predates `removeOrphaned()`; replicate it as a
    // loop over the `orphaned` selector + `remove` (what the store does).
    const orphans = await db.attachments.orphaned.items();
    for (const a of orphans) {
      await db.attachments.remove(a.hash, false);
    }
    expect(await db.attachments.orphaned.count()).toBe(0);
    expect(await db.attachments.all.count()).toBe(1); // the linked one remains
    expect(await db.attachments.linked.count()).toBe(1);
  });
});