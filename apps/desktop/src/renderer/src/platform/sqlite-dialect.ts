/*
Renderer-side Kysely dialect for the desktop bridge. Ported from upstream
`apps/web/src/common/sqlite/index.desktop.ts` (GPL-3.0).

The renderer holds the `@notesnook/core` `Database`, which compiles queries to
SQL+params via Kysely. This dialect's driver forwards each compiled statement
to the main process (`desktop.sqlite.run`), where `better-sqlite3-multiple-
ciphers` executes it. SQLite has a single connection, so access is serialised
by a mutex.

The tRPC client is injected (defaulting to the real `desktop` bridge) so the
forwarder can be tested against an in-process fake bridge without Electron.
*/
import {
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  CompiledQuery
} from "@streetwriters/kysely";
import type {
  Dialect,
  Driver,
  DatabaseConnection,
  QueryResult,
  TransactionSettings
} from "@streetwriters/kysely";
import { desktop as defaultDesktop } from "./desktop-bridge";
import type { SQLiteParameter, SQLiteQueryResult } from "@contracts/router";

/**
 * Structural slice of the tRPC bridge client used by the SQLite driver. The
 * real `desktop.sqlite` (a tRPC proxy) satisfies this; tests inject a fake
 * backed by in-process better-sqlite3. Kept structural (not `Desktop["sqlite"]`)
 * so the dialect module doesn't depend on tRPC's proxy types and is trivially
 * testable.
 */
export interface SqliteBridgeClient {
  open: { mutate: (input: { filePath: string }) => Promise<string> };
  run: {
    mutate: (input: { id: string; sql: string; parameters?: SQLiteParameter[] }) => Promise<SQLiteQueryResult>;
  };
  close: { mutate: (input: { id: string }) => Promise<void> };
  delete: { mutate: (input: { id: string }) => Promise<void> };
}

type SqliteClient = SqliteBridgeClient;

/** Minimal promise-chain mutex (replaces upstream's `async-mutex` dep). */
class Mutex {
  private tail: Promise<void> = Promise.resolve();
  acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => (release = resolve));
    const prev = this.tail;
    this.tail = next;
    return prev.then(() => release);
  }
}

class SqliteDriver implements Driver {
  connection?: DatabaseConnection;
  private readonly mutex = new Mutex();
  private release: (() => void) | undefined = undefined;
  private handle: string | undefined;
  constructor(
    private readonly config: { name: string },
    private readonly client: SqliteClient
  ) {}

  async init(): Promise<void> {
    const handle = await this.client.open.mutate({ filePath: this.config.name });
    this.handle = handle;
    this.connection = new SqliteBridgeConnection(handle, this.client);
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    if (!this.connection) throw new Error("Driver not initialized.");
    // SQLite has a single connection — serialise access.
    this.release = await this.mutex.acquire();
    return this.connection;
  }

  async beginTransaction(connection: DatabaseConnection, _settings: TransactionSettings): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("begin"));
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("commit"));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("rollback"));
  }

  async releaseConnection(_connection: DatabaseConnection): Promise<void> {
    this.release?.();
    this.release = undefined;
  }

  async destroy(): Promise<void> {
    if (!this.handle) return;
    await this.client.close.mutate({ id: this.handle });
  }
}

class SqliteBridgeConnection implements DatabaseConnection {
  constructor(
    private readonly handle: string,
    private readonly client: SqliteClient
  ) {}

  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("bridge sqlite driver doesn't support streaming");
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const { sql, parameters } = compiledQuery;
    const result = await this.client.run.mutate({
      id: this.handle,
      sql,
      parameters: parameters as SQLiteParameter[]
    });
    return result as unknown as QueryResult<R>;
  }
}

export interface DialectOptions {
  /** Database filename as passed to main `sqlite.open` (e.g. "Notesnook" or ":memory:"). */
  name: string;
  /** tRPC bridge client. Defaults to the real `desktop` bridge; tests inject a fake. */
  client?: SqliteClient;
}

/**
 * Build a Kysely `Dialect` that executes over the Electron tRPC bridge. Mirrors
 * upstream `createDialect` from `index.desktop.ts`; the `init` callback (used
 * by the wa-sqlite path to load extensions after PRAGMAs) is unused on desktop.
 */
export const createDialect = (options: DialectOptions): Dialect => {
  const client = options.client ?? defaultDesktop.sqlite;
  return {
    createDriver: () => new SqliteDriver({ name: options.name }, client),
    createAdapter: () => new SqliteAdapter(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler()
  };
};

// Re-export so callers can reference the result type if needed.
export type { SQLiteQueryResult };