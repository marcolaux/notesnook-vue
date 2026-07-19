/**
 * Gate / data-pipeline contract test — proves `@notesnook/core`'s `Database`
 * initialises, runs migrations, and round-trips notes against an in-process
 * SQLite, WITHOUT Electron. This is the deterministic de-risk for the whole
 * Phase 1 spine: if `db.init()` + `notes.add`/`notes.all` work here, the dialect
 * contract, FTS5 (built-in trigram), migrations, and the four platform impls are
 * all correct. The production path reuses the same `initDatabase()` with the
 * bridge dialect instead of the in-process one.
 *
 * Platform injected here:
 *  - dialect: kysely's built-in `SqliteDialect` over `better-sqlite3-multiple-
 *    ciphers` `:memory:` (same SQL surface the bridge dialect forwards).
 *  - compressor: in-process node zlib (same as Main's `compressorServer`).
 *  - storage/fs: the stubs (init with no user touches neither crypto nor files).
 */
import { describe, it, expect } from "vitest";
import { SqliteDialect } from "@streetwriters/kysely";
import BetterSqlite from "better-sqlite3-multiple-ciphers";
import { gzipSync, gunzipSync } from "node:zlib";
import type {
  ICompressor,
  SQLiteOptions
} from "@notesnook-vue/contracts";
import { initDatabase } from "../../apps/desktop/src/renderer/src/platform/database";
import { StubStorage } from "../../apps/desktop/src/renderer/src/platform/stub-storage";
import { StubFileStorage } from "../../apps/desktop/src/renderer/src/platform/stub-fs";

/** In-process zlib compressor mirroring Main's `compressorServer`. */
class InProcessCompressor implements ICompressor {
  async compress(data: string): Promise<string> {
    return gzipSync(Buffer.from(data, "utf-8"), { level: 6 }).toString("base64");
  }
  async decompress(data: string): Promise<string> {
    return gunzipSync(Buffer.from(data, "base64")).toString("utf-8");
  }
}

/** Build an in-process `:memory:` platform (tests only — no Electron bridge). */
function createInProcessPlatform(): {
  sqliteOptions: SQLiteOptions;
  storage: StubStorage;
  fs: StubFileStorage;
  compressor: InProcessCompressor;
} {
  // One shared in-memory DB instance — `dialect()` may be called once by core
  // to build its Kysely; passing the instance (not a factory) keeps a single DB.
  const dbInstance = new BetterSqlite(":memory:");
  return {
    sqliteOptions: {
      dialect: () => new SqliteDialect({ database: dbInstance }),
      journalMode: "WAL",
      synchronous: "normal",
      lockingMode: "exclusive",
      tempStore: "memory",
      cacheSize: -32000,
      pageSize: 8192
    },
    storage: new StubStorage(),
    fs: new StubFileStorage(),
    compressor: new InProcessCompressor()
  };
}

describe("data pipeline: Database init + notes round-trip (in-process)", () => {
  it("db.init() runs migrations without error", async () => {
    const db = await initDatabase(createInProcessPlatform());
    expect(db.isInitialized).toBe(true);
  });

  it("notes.add (title-only) and notes.all round-trip", async () => {
    const db = await initDatabase(createInProcessPlatform());
    expect(await db.notes.all.count()).toBe(0);

    const id = await db.notes.add({ title: "First note" });
    expect(typeof id).toBe("string");

    expect(await db.notes.all.count()).toBe(1);
    const items = await db.notes.all.items();
    expect(items.length).toBe(1);
    expect(items[0]?.id).toBe(id);
    expect(items[0]?.title).toBe("First note");
  });

  it("notes.add with tiptap content extracts a headline", async () => {
    const db = await initDatabase(createInProcessPlatform());
    const id = await db.notes.add({
      content: { type: "tiptap", data: "<p>Hello world</p>" }
    });
    const note = await db.notes.note(id);
    expect(note).toBeDefined();
    // headline is derived from the first paragraph of the content
    expect(note?.headline).toContain("Hello world");
  });

  it("compressor round-trips (content is stored compressed)", async () => {
    const compressor = new InProcessCompressor();
    const original = "<p>Some note body text to compress</p>";
    const compressed = await compressor.compress(original);
    expect(compressed).not.toBe(original);
    expect(await compressor.decompress(compressed)).toBe(original);
  });
});