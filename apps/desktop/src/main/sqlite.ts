/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

/**
 * Main-process SQLite engine — a thin wrapper around
 * `better-sqlite3-multiple-ciphers` exposed to the renderer over the tRPC
 * bridge (`sqlite.open/run/close/delete`). Ported from upstream
 * `apps/desktop/src/api/sqlite-kysely.ts`.
 *
 * The renderer holds the Kysely `Database` and compiles queries to SQL+params;
 * Main just prepares+runs them. PRAGMA `key` (decryption) and the other
 * `SQLiteOptions` PRAGMAs are applied by `@notesnook/core` over this channel
 * before any user query. FTS5 loadable extensions (`sqlite-better-trigram`,
 * `sqlite3-fts5-html`) are loaded after the database is first decrypted.
 */
import { app } from "electron";
import path from "node:path";
import { statSync } from "node:fs";
import { createRequire } from "node:module";
import Database from "better-sqlite3-multiple-ciphers";
import * as sqliteVec from "sqlite-vec";
import {
  registerSQLiteServer
} from "../contracts/router";
import type {
  SQLiteParameter,
  SQLiteQueryResult,
  SQLiteServer
} from "../contracts/router";
import { DB_LOCKED_MARKER } from "../contracts/db-locked";

type SqliteDB = Database.Database;
type SqliteStatement = Database.Statement<unknown[], unknown>;

const require_ = createRequire(import.meta.url);

/**
 * M4 (done): the prebuilt FTS5 tokenizer extension packages
 * (`sqlite-better-trigram` + `sqlite3-fts5-html`, with their per-platform
 * `*-<os>-<arch>` binary variants) are installed as (optional)Dependencies.
 * `loadExtensions` loads them after the DB is first decrypted, registering the
 * `better_trigram` + `html` tokenizers that core's `migrations` reference — so
 * core's dist runs byte-for-byte upstream (no dist string-patches needed).
 * Verified to load against `better-sqlite3-multiple-ciphers@12.11.1`
 * (SQLite 3.53.2).
 */
const LOAD_FTS5_EXTENSIONS = true;

class SQLite {
  private sqlite?: SqliteDB;
  private initialized = false;
  private readonly preparedStatements = new Map<string, SqliteStatement>();
  private readonly retryCounter: Record<string, number> = {};
  private extensionsLoaded = false;
  private filePath?: string;

  async open(filename: string): Promise<string> {
    if (this.sqlite) {
      throw new Error("Database is already initialized");
    }

    this.filePath =
      filename === ":memory:"
        ? filename
        : path.join(app.getPath("userData"), filename) + ".sql";
    if (!isPathAllowed(this.filePath))
      throw new Error("Database path is not allowed: " + this.filePath);
    try {
      this.sqlite = new Database(this.filePath).unsafeMode(true);
      this.sqlite.function("regexp", (pattern: unknown, text: unknown) => {
        if (typeof pattern !== "string" || text == null) return 0;
        try {
          const regex = new RegExp(pattern, "i");
          return regex.test(String(text)) ? 1 : 0;
        } catch {
          return 0;
        }
      });
    } catch (e) {
      // Open itself rarely acquires the exclusive lock (the first write-class
      // PRAGMA does), but cover it so a held lock surfaces as the marked error
      // rather than a bare SqliteError with no marker.
      throw wrapSqliteError(e, "(open)");
    }
    return filename; // id == the filename requested (matches upstream: handle = filePath)
  }

  /**
   * Prepare a statement, caching it. Retries up to 5 times on flaky failures.
   */
  private async prepare(sql: string): Promise<SqliteStatement | undefined> {
    if (!this.sqlite) throw new Error("Database is not initialized.");
    try {
      const cached = this.preparedStatements.get(sql);
      if (cached !== undefined) return cached;

      const prepared = this.sqlite.prepare(sql) as SqliteStatement;
      if (!prepared) return;

      this.preparedStatements.set(sql, prepared);
      this.retryCounter[sql] = 0;
      return prepared;
    } catch (ex) {
      console.error(ex);
      // A held lock (another instance) is not a flaky transient — fail fast
      // with the marked error instead of burning 5 instant retries.
      if (isDatabaseLockedError(ex)) {
        this.retryCounter[sql] = 0;
        throw wrapSqliteError(ex, sql);
      }
      if ((this.retryCounter[sql] ?? 0) < 5) {
        this.retryCounter[sql] = (this.retryCounter[sql] ?? 0) + 1;
        console.warn("Failed to prepare statement. Retrying:", sql);
        return this.prepare(sql);
      }
      this.retryCounter[sql] = 0;
      if (ex instanceof Error) ex.message += ` (query: ${sql})`;
      throw ex;
    }
  }

  async run<R>(
    id: string,
    sql: string,
    parameters: SQLiteParameter[] = []
  ): Promise<SQLiteQueryResult<R>> {
    if (!this.sqlite) throw new Error("No database is opened.");
    const prepared = await this.prepare(sql);
    if (!prepared) return { rows: [] as R[] };
    try {
      if (prepared.reader) {
        return { rows: prepared.all(parameters) as R[] };
      } else {
        const { changes, lastInsertRowid } = prepared.run(parameters);
        const numAffectedRows =
          changes !== undefined && changes !== null && !Number.isNaN(changes)
            ? BigInt(changes)
            : undefined;
        return {
          numAffectedRows,
          insertId:
            lastInsertRowid !== undefined && lastInsertRowid !== null
              ? typeof lastInsertRowid === "bigint"
                ? lastInsertRowid
                : BigInt(lastInsertRowid as number)
              : undefined,
          rows: [] as R[]
        };
      }
    } catch (e) {
      throw wrapSqliteError(e, sql);
    } finally {
      // SQLite3MC v2 needs the DB decrypted before FTS5 extensions can load.
      if (LOAD_FTS5_EXTENSIONS && !this.extensionsLoaded && (await this.isDatabaseReady())) {
        this.loadExtensions();
      }
    }
  }

  async close(): Promise<void> {
    if (!this.sqlite) return;
    this.preparedStatements.clear();
    this.sqlite.close();
    this.sqlite = undefined;
  }

  async delete(): Promise<void> {
    if (!this.filePath) return;
    await this.close();
    const { rm } = await import("node:fs/promises");
    await rm(this.filePath, { force: true, maxRetries: 5, retryDelay: 500 });
  }

  /**
   * Force-unlock a stuck database: release our connection (if still open) and
   * delete the `-wal`/`-shm` journal sidecars so the next `open` rebuilds them
   * cleanly. Recovers from a crash/bug that left a torn journal holding the
   * lock — the on-disk file lock dies with the holding process, but a corrupt
   * WAL can still block re-open, and a closed connection here releases our own
   * half-open handles.
   *
   * The main `.sql` file (the data) is KEPT; only the journal is dropped. Any
   * committed-but-not-yet-checkpointed writes still sitting in the WAL are lost
   * — the trade-off the user accepts (via the renderer's confirm dialog) in
   * exchange for getting back a stuck DB. Safe ONLY when no other process has
   * the file open: deleting a LIVE instance's WAL would corrupt it, so the
   * renderer warns the user to close other Notesnook windows first.
   */
  async forceUnlock(): Promise<void> {
    await this.close();
    if (!this.filePath || this.filePath === ":memory:") return;
    await clearJournalSidecars(this.filePath);
  }

  private loadExtensions(): void {
    this.sqlite?.loadExtension(getExtensionPath("sqlite-better-trigram", "better-trigram"));
    this.sqlite?.loadExtension(getExtensionPath("sqlite3-fts5-html", "fts5-html"));
    try {
      if (this.sqlite) {
        sqliteVec.load(this.sqlite);
        this.sqlite.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS vec_notes USING vec0(
            +note_id text,
            +chunk_index integer,
            +chunk_hash text,
            embedding float[384] distance_metric=cosine
          );
        `);
      }
    } catch (e) {
      console.error("[sqlite-vec] Failed to load extension or initialize vec_notes table:", e);
    }
    this.extensionsLoaded = true;
  }

  /**
   * Executes `SELECT 1` to confirm the database is ready. On an encrypted DB
   * this fails until `PRAGMA key` has decrypted it.
   */
  private async isDatabaseReady(): Promise<boolean> {
    if (!this.sqlite) return false;
    try {
      (this.sqlite.prepare("SELECT 1;") as SqliteStatement).run();
      return true;
    } catch {
      return false;
    }
  }
}

function getExtensionPath(extensionName: string, entryPoint: string): string {
  const os = process.platform === "win32" ? "windows" : process.platform;
  const packageName = `${extensionName}-${os}-${process.arch}`;
  const extensionSuffix =
    process.platform === "win32" ? "dll" : process.platform === "darwin" ? "dylib" : "so";
  let loadablePath = path.join(
    require_.resolve(extensionName),
    "..",
    "..",
    packageName,
    `${entryPoint}.${extensionSuffix}`
  );

  if (loadablePath.includes(".asar"))
    loadablePath = loadablePath
      .replace("electron.asar", "app.asar")
      .replace(".asar", ".asar.unpacked");

  if (!statSync(loadablePath, { throwIfNoEntry: false }))
    throw new Error(`${extensionName} not found at ${loadablePath}.`);
  return loadablePath;
}

function rewriteError(e: Error, message: string): Error {
  const error = new Error(message);
  error.stack = e.stack;
  error.name = e.name;
  error.cause = e.cause;
  return error;
}

/**
 * SQLite held-lock error codes that mean another OS process (another app
 * instance) is holding the database's WAL/exclusive lock. `better-sqlite3`'s
 * `SqliteError` exposes `.code` as an own enumerable property — readable here
 * in main, but lost crossing Electron IPC, so on a hit we embed
 * `DB_LOCKED_MARKER` in the message (the only channel the renderer retains).
 *
 * Excludes the same-connection re-entrancy throws ("This database connection is
 * busy executing a query"), which are `SqliteError`s with code `"SQLITE_BUSY"`
 * too but surface as `TypeError`s from the native guard and aren't cross-process
 * locks — those keep the generic `(query: …)` rewrite.
 */
const LOCKED_CODES = new Set([
  "SQLITE_BUSY",
  "SQLITE_BUSY_RECOVERY",
  "SQLITE_BUSY_SNAPSHOT",
  "SQLITE_LOCKED",
  "SQLITE_LOCKED_SHAREDCACHE",
  "SQLITE_LOCKED_VTAB"
]);

function isDatabaseLockedError(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" && LOCKED_CODES.has(code);
}

/**
 * Wrap a caught SQLite error for the renderer. A held-lock error becomes a
 * marked, friendly failure (`DB_LOCKED_MARKER` prefix) so the boot overlay can
 * distinguish "another instance holds the lock" from a generic startup failure
 * and offer a Retry. Anything else keeps the existing `(query: …)` rewrite.
 */
function wrapSqliteError(e: unknown, sql: string): Error {
  if (isDatabaseLockedError(e)) {
    const detail = e instanceof Error ? e.message : String(e);
    return new Error(`${DB_LOCKED_MARKER}: ${detail}`);
  }
  if (e instanceof Error) {
    return rewriteError(e, `${e.message} (query: ${sql})`);
  }
  return new Error(String(e));
}

function isPathAllowed(databasePath: string): boolean {
  if (databasePath === ":memory:") return true;
  const base = app.getPath("userData");
  const resolved = path.resolve(databasePath);
  return resolved.startsWith(base + path.sep);
}

/**
 * Delete the `-wal`/`-shm` journal sidecars for a database base path. Best-
 * effort: a failure to remove one sidecar is logged and swallowed (the other
 * is still tried) — the next `open` rebuilds whatever it can't find. Never
 * throws so `forceUnlock` can't strand the user in a worse state than they're
 * already in.
 */
async function clearJournalSidecars(basePath: string): Promise<void> {
  if (basePath === ":memory:") return;
  if (!isPathAllowed(basePath)) return;
  const { rm } = await import("node:fs/promises");
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = basePath + suffix;
    try {
      await rm(sidecar, { force: true, maxRetries: 3, retryDelay: 200 });
    } catch (e) {
      console.error(`[sqlite] forceUnlock: could not remove ${sidecar}:`, e);
    }
  }
}

/**
 * Registry of open databases keyed by the id returned from `open` (the
 * requested filename). Mirrors upstream `databases` map.
 */
const databases = new Map<string, SQLite>();

export const sqliteServer: SQLiteServer = {
  async open(filePath) {
    const existing = databases.get(filePath);
    if (existing) return filePath;
    const sqlite = new SQLite();
    await sqlite.open(filePath);
    databases.set(filePath, sqlite);
    return filePath;
  },
  async run(id, sql, parameters) {
    const sqlite = databases.get(id);
    if (!sqlite) throw new Error("Database not found for id: " + id);
    return sqlite.run(id, sql, parameters);
  },
  async close(id) {
    const sqlite = databases.get(id);
    if (!sqlite) throw new Error("Database not found for id: " + id);
    await sqlite.close();
    databases.delete(id);
  },
  async delete(id) {
    const sqlite = databases.get(id);
    if (!sqlite) throw new Error("Database not found for id: " + id);
    await sqlite.delete();
    databases.delete(id);
  },
  async forceUnlock(filePath) {
    // If we have an open connection for this id (open succeeded earlier),
    // close it + clear its journal via the instance (which knows its real
    // path). Then drop it from the registry so the next `open` re-creates it.
    const sqlite = databases.get(filePath);
    if (sqlite) {
      await sqlite.forceUnlock();
      databases.delete(filePath);
      return;
    }
    // The locked-boot case: `open` never completed so there's no instance in
    // the registry. Resolve the path the same way `open` does and clear the
    // journal sidecars directly.
    const base =
      filePath === ":memory:"
        ? filePath
        : path.join(app.getPath("userData"), filePath) + ".sql";
    if (!isPathAllowed(base))
      throw new Error("Database path is not allowed: " + base);
    await clearJournalSidecars(base);
  }
};

export function registerSQLite(): void {
  migrateLegacyLocalDbFile();
  registerSQLiteServer(sqliteServer);
}

/**
 * One-time legacy-DB → local migration (file side). Before per-context support
 * there was a single `notesnook.sql`; the local context now uses
 * `notesnook-local.sql`. If the local file is absent but the legacy file is
 * present, rename it so the user's existing local data is preserved (the
 * matching keychain key is copied renderer-side in `key-store.ts`). Idempotent
 * — a no-op once the local file exists or the legacy file is gone. Best-effort:
 * a failure is logged and swallowed (a fresh local DB is created instead).
 */
function migrateLegacyLocalDbFile(): void {
  try {
    const base = app.getPath("userData");
    const { existsSync, renameSync } = require("node:fs") as typeof import("node:fs");
    const legacy = path.join(base, "notesnook.sql");
    const local = path.join(base, "notesnook-local.sql");
    if (existsSync(local) || !existsSync(legacy)) return;
    // Move the DB plus its WAL/SHM sidecars so no checkpointed data is lost.
    for (const suffix of ["", "-wal", "-shm"]) {
      const from = `${legacy}${suffix}`;
      const to = `${local}${suffix}`;
      if (existsSync(from)) renameSync(from, to);
    }
    console.info("[sqlite] migrated legacy notesnook.sql → notesnook-local.sql");
  } catch (e) {
    console.error("[sqlite] legacy DB migration failed (will use a fresh local DB):", e);
  }
}

app.on("before-quit", async () => {
  for (const db of databases.values()) {
    try {
      await db.close();
    } catch (e) {
      console.error("Error closing database:", e);
    }
  }
});