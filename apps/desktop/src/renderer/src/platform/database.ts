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
import { StubStorage } from "./stub-storage";
import { StubFileStorage } from "./stub-fs";

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
 * Production platform for the de-risk Gate: bridge dialect + real compressor +
 * stub storage/fs. M6 wires a real `sqliteOptions.password` (databaseKey);
 * M7/M8 replace the stubs.
 */
export function createDesktopPlatform(): DatabasePlatform {
  const sqliteOptions: SQLiteOptions = {
    dialect: (name) => createDialect({ name }),
    journalMode: "WAL",
    synchronous: "normal",
    lockingMode: "exclusive",
    tempStore: "memory",
    cacheSize: -32000,
    pageSize: 8192
    // `password` omitted (unencrypted DB) until M6 derives the databaseKey.
  };
  return {
    sqliteOptions,
    storage: new StubStorage(),
    fs: new StubFileStorage(),
    compressor: new Compressor()
  };
}