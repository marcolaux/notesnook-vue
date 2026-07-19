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
import { createFileStorage } from "./fs";
import { getDatabaseKey, databaseKeyToPassword, SafeStorageKeyStore } from "./key-store";
import type { Hosts } from "./server-config";

export interface DatabasePlatform {
  sqliteOptions: SQLiteOptions;
  storage: IStorage;
  fs: IFileStorage;
  compressor: ICompressor;
}

/**
 * Construct, configure and initialise the Database. `db.host(h)` is called with
 * the resolved server hosts (default Notesnook servers, or a self-hosted bag
 * chosen at the login screen) so sync/auth have somewhere to reach; offline use
 * is unaffected. `db.host()` must run before `db.init()`. Returns the
 * initialised singleton-grade instance.
 */
export async function initDatabase(
  platform: DatabasePlatform,
  h: Hosts = hosts
): Promise<Database> {
  const db = new Database();
  db.host(h);
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
 * (IndexedDB KV + sodium crypto + safeStorage key store) + real `FileStorage`
 * (streamable-fs over Main node-fs, sodium streaming encryption). Derives (or
 * retrieves) the `databaseKey` and sets `sqliteOptions.password` so the on-disk
 * DB is encrypted.
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
    fs: createFileStorage(),
    compressor: new Compressor()
  };
}