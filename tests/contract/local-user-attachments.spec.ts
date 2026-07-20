/**
 * Local-user + attachments crypto round-trip — the deterministic de-risk for
 * making drag-and-drop / paste of images work in *local mode* (no server login).
 *
 * Proves, WITHOUT Electron, that:
 *  - `ensureLocalUser` synthesises a `User` + derives a master key so
 *    `db.attachments.save` (which needs `getAttachmentsKey` → `getMasterKey`)
 *    stops throwing "Failed to get user encryption key", and is idempotent.
 *  - `db.attachments.save` (base64) → `db.attachments.read(hash, "base64")`
 *    round-trips an encrypted attachment (sodium secretstream via the real
 *    `createFileStorage` over an in-memory chunk store).
 *  - the `getAttachmentData` storage bridge (set by `wireAttachmentStorage`)
 *    returns the data URL for a saved hash against the same real db.
 *
 * Platform: in-process `:memory:` SQLite (per `data.spec.ts`), real `NNStorage`
 * with `persistence: "memory"` (MemoryKVStore — no IndexedDB) + an in-memory
 * `IKeyStore` (no OS keychain), real `createFileStorage` over `MemoryFileStore`
 * (per `filestorage.spec.ts`), in-process zlib compressor. `getDatabase` (from
 * `@/platform/bootstrap`) is mocked to return the real db so the bridge module
 * reaches it without the Electron tRPC bridge.
 */
import { describe, it, expect, vi } from "vitest";
import { SqliteDialect } from "@streetwriters/kysely";
import BetterSqlite from "better-sqlite3-multiple-ciphers";
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
import {
  ensureLocalUser,
  buildLocalUser,
  LOCAL_USER_EMAIL
} from "@/platform/local-user";

// Mock `@/platform/bootstrap`'s `getDatabase` so the attachments-bridge module
// (imported below) reaches the real test db without the Electron tRPC bridge.
// `dbRef` is set after `initDatabase` resolves; the hoisted setter is exported
// for the mock + the test.
const dbRef = vi.hoisted(() => {
  let db: Database | undefined;
  return {
    getDatabase: () => db,
    setDatabase: (d: Database) => {
      db = d;
    }
  };
});
vi.mock("@/platform/bootstrap", () => ({ getDatabase: dbRef.getDatabase }));
// Import after the mock is registered so the bridge picks up the mock.
const { wireAttachmentStorage } = await import("@/editor/attachments-bridge");

/** In-memory `IKeyStore` (stands in for Main's `safeStorage` keychain). */
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

/** In-memory chunk store (per `filestorage.spec.ts`). */
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

/** In-process zlib compressor mirroring Main's `compressorServer`. */
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
  // One shared key-store instance (the factory is called per crypto op; a fresh
  // instance each time would lose the key written by `deriveCryptoKey`).
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
  const db = await initDatabase({
    sqliteOptions,
    storage,
    fs,
    compressor: new InProcessCompressor()
  });
  dbRef.setDatabase(db);
  return db;
}

describe("local-user + attachments crypto (local mode)", () => {
  it("buildLocalUser has the sentinel email + a valid free/expired shape", () => {
    const user = buildLocalUser("c2FsdA==");
    expect(user.email).toBe(LOCAL_USER_EMAIL);
    expect(user.salt).toBe("c2FsdA==");
    expect(user.isEmailConfirmed).toBe(true);
    expect(user.mfa.isEnabled).toBe(false);
    expect(user.subscription.plan).toBe(0); // SubscriptionPlan.FREE
    expect(user.subscription.status).toBe(4); // SubscriptionStatus.EXPIRED
    expect(user.subscription.provider).toBe(0); // SubscriptionProvider.STREETWRITERS
  });

  it("ensureLocalUser creates a user + master key so attachments.save works", async () => {
    const db = await setupDb();
    expect(await db.user.getUser()).toBeUndefined(); // no user before
    await ensureLocalUser(db);

    const user = await db.user.getUser();
    expect(user).toBeDefined();
    expect(user?.email).toBe(LOCAL_USER_EMAIL);

    // The whole point: attachments.save no longer throws.
    const base64 = btoa("some-image-bytes");
    const hash = await db.attachments.save(base64, "image/png", "drop.png");
    expect(typeof hash).toBe("string");
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex

    // Round-trip: read the encrypted attachment back as a data URL.
    const data = await db.attachments.read(hash as string, "base64");
    expect(typeof data).toBe("string");
    expect(data).toMatch(/^data:image\/png;base64,/);
  });

  it("ensureLocalUser is idempotent (re-run does not throw or change the user)", async () => {
    const db = await setupDb();
    await ensureLocalUser(db);
    const user1 = await db.user.getUser();
    await ensureLocalUser(db); // second run
    const user2 = await db.user.getUser();
    expect(user2?.salt).toBe(user1?.salt);
    expect(user2?.email).toBe(LOCAL_USER_EMAIL);

    // attachments still work after the second ensureLocalUser.
    const hash = await db.attachments.save(btoa("payload"), "image/png", "x.png");
    expect(hash).toBeDefined();
  });

  it("wireAttachmentStorage.getAttachmentData returns the data URL for a saved hash", async () => {
    const db = await setupDb();
    await ensureLocalUser(db);
    const base64 = btoa("bridge-image-bytes");
    const hash = await db.attachments.save(base64, "image/png", "bridge.png");
    expect(hash).toBeDefined();

    // Minimal fake editor: `wireAttachmentStorage` only touches `storage`.
    const fakeEditor = { storage: {} } as unknown as import("@tiptap/vue-3").Editor;
    wireAttachmentStorage(fakeEditor);
    const getAttachmentData = (
      fakeEditor.storage as { getAttachmentData: (p: { hash: string }) => Promise<string | undefined> }
    ).getAttachmentData;
    expect(typeof getAttachmentData).toBe("function");

    const data = await getAttachmentData({ hash: hash as string });
    expect(typeof data).toBe("string");
    expect(data).toMatch(/^data:image\/png;base64,/);

    // A missing hash resolves to undefined (not a throw).
    const missing = await getAttachmentData({ hash: "nonexistent-hash" });
    expect(missing).toBeUndefined();
  });
});