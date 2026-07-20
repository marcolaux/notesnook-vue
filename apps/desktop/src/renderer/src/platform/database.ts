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
import {
  dbFileName,
  indexedDBName,
  LOCAL_CONTEXT,
  type ContextId
} from "./account-context";

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
 * initialised instance (the caller — `bootstrap.ts` — holds it as the
 * context-scoped singleton).
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
    // The newer core takes a `CompressorAccessor = () => Promise<ICompressor>`
    // (a factory), not an instance — wrap our compressor accordingly.
    compressor: () => Promise.resolve(platform.compressor),
    // Note-history version cap (newer core requires it). `undefined` = no cap
    // until a settings-driven value is wired in.
    maxNoteVersions: () => Promise.resolve(undefined),
    batchSize: 100
  } satisfies DatabaseOptions);
  await db.init();
  return db;
}

/**
 * Production platform for a context: bridge dialect (pointed at the context's
 * SQLite file) + real compressor + real `NNStorage` (per-context IndexedDB KV
 * + sodium crypto + per-context safeStorage key store) + real `FileStorage`
 * (streamable-fs over Main node-fs, sodium streaming encryption). Derives (or
 * retrieves) the context's `databaseKey` and sets `sqliteOptions.password` so
 * the on-disk DB is encrypted with the context's own key.
 *
 * The dialect factory ignores core's hardcoded `"notesnook"` name argument and
 * opens the context's file (`notesnook-<contextId>.sql`) instead — the only way
 * to target a per-account file, since core's `Database.init()` passes a fixed
 * `"notesnook"` to the dialect.
 */
export async function createDesktopPlatform(
  contextId: ContextId = LOCAL_CONTEXT
): Promise<DatabasePlatform> {
  const key = await getDatabaseKey(contextId);
  const sqliteOptions: SQLiteOptions = {
    // Override core's hardcoded `"notesnook"` with the context's filename.
    dialect: () => createDialect({ name: dbFileName(contextId) }),
    password: databaseKeyToPassword(key),
    journalMode: "WAL",
    synchronous: "normal",
    lockingMode: "exclusive",
    tempStore: "memory",
    cacheSize: -32000,
    pageSize: 8192
  };
  const keyStore = new SafeStorageKeyStore(contextId);
  return {
    sqliteOptions,
    storage: new NNStorage(indexedDBName(contextId), () => keyStore),
    fs: createFileStorage(),
    compressor: new Compressor()
  };
}