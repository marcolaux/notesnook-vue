/**
 * Database wiring — constructs and initialises the `@notesnook/core`
 * `Database` with injected platform implementations.
 *
 * Dependency-injected so the same init logic runs in two contexts:
 *  - Production (Electron renderer): bridge Kysely dialect (forwards SQL to
 *    Main's better-sqlite3), real `Compressor` (forwards to Main zlib), and —
 *    for now — stub `IStorage`/`IFileStorage`. M6/M7/M8 swap the stubs for the
 *    real key store / NNStorage / FileStorage.
 *  - Tests (vitest, node): in-process Kysely `SqliteDialect` over
 *    better-sqlite3 and an in-process zlib compressor, with the same stubs.
 *
 * The `db.init()` + migrations path is therefore proven deterministically in
 * tests without Electron, and the production path is the same code with a
 * different dialect/compressor.
 */
import {
  Database,
  hosts
} from "@notesnook-vue/contracts";
import type {
  IStorage,
  IFileStorage,
  ICompressor,
  SQLiteOptions,
  DatabaseOptions
} from "@notesnook-vue/contracts";
import { createDialect } from "./sqlite-dialect";
import { Compressor } from "./compressor";
import { NNStorage } from "./storage";
import { StubFileStorage } from "./stub-fs";
import { getDatabaseKey, databaseKeyToPassword, SafeStorageKeyStore } from "./key-store";

export interface DatabasePlatform {
  sqliteOptions: SQLiteOptions;
  storage: IStorage;
  fs: IFileStorage;
  compressor: ICompressor;
}

/**
 * Construct, configure and initialise the Database. `db.host()` is called with
 * the default Notesnook hosts so sync has somewhere to reach (offline use is
 * unaffected). Returns the initialised singleton-grade instance.
 */
export async function initDatabase(platform: DatabasePlatform): Promise<Database> {
  const db = new Database();
  db.host(hosts);
  db.setup({
    sqliteOptions: platform.sqliteOptions,
    storage: platform.storage,
    fs: platform.fs,
    compressor: platform.compressor,
    batchSize: 100
  } satisfies DatabaseOptions);
  await db.init();
  return db;
}

/**
 * Production platform: bridge dialect + real compressor + real `NNStorage`
 * (IndexedDB KV + sodium crypto + safeStorage key store). Derives (or
 * retrieves) the `databaseKey` and sets `sqliteOptions.password` so the on-disk
 * DB is encrypted. M8 replaces the stub `IFileStorage` with the real
 * `FileStorage`.
 */
export async function createDesktopPlatform(): Promise<DatabasePlatform> {
  const key = await getDatabaseKey();
  const sqliteOptions: SQLiteOptions = {
    dialect: (name) => createDialect({ name }),
    password: databaseKeyToPassword(key),
    journalMode: "WAL",
    synchronous: "normal",
    lockingMode: "exclusive",
    tempStore: "memory",
    cacheSize: -32000,
    pageSize: 8192
  };
  const keyStore = new SafeStorageKeyStore();
  return {
    sqliteOptions,
    storage: new NNStorage("Notesnook", () => keyStore),
    fs: new StubFileStorage(),
    compressor: new Compressor()
  };
}