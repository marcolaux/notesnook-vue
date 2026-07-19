/**
 * Contract for the Electron main <-> renderer tRPC router.
 *
 * This file is the single source of truth for the bridge procedure shapes. It
 * is imported as a *value* by the main process (which builds and serves it) and
 * as a *type* by the renderer (`import type { AppRouter }`). Therefore it MUST
 * stay free of Node-only imports (better-sqlite3, electron, node:fs, …) so the
 * renderer's web typecheck never has to resolve them.
 *
 * Main-process capabilities that need Node-only deps are implemented in
 * `src/main/*` and injected here via registration functions (`registerSQLiteServer`,
 * `registerCompressorServer`, …). Each capability declares a structural server
 * interface below; the procedures delegate to the registered impl. The renderer
 * sees fully typed procedures without any Node module in its type graph.
 *
 * Procedures mirror the upstream `apps/desktop` AppRouter shape so call sites
 * stay compatible.
 */
import { initTRPC } from "@trpc/server";
import { z } from "zod";

const t = initTRPC.create();

// ---------------------------------------------------------------------------
// SQLite — matches upstream apps/desktop/src/api/sqlite-kysely.ts
// ---------------------------------------------------------------------------

/**
 * Values bindable as SQL parameters. Mirrors better-sqlite3's accepted types.
 * `bigint` is included because Kysely returns `numAffectedRows`/`insertId` as
 * bigint; Electron IPC uses structured clone, which serialises bigint natively.
 */
export type SQLiteParameter = number | string | Uint8Array | number[] | bigint | null;

/**
 * Structural subset of `@streetwriters/kysely`'s `QueryResult` that crosses the
 * bridge. Defined here (not imported from kysely) to keep the renderer's type
 * graph free of the kysely dependency.
 */
export interface SQLiteQueryResult<R = unknown> {
  rows: R[];
  numAffectedRows?: bigint;
  insertId?: bigint;
}

export interface SQLiteServer {
  /** Open (or reuse) a database file. `":memory:"` is allowed. Returns an id. */
  open(filePath: string): Promise<string>;
  /** Execute a compiled SQL statement with the given parameters. */
  run<R = unknown>(id: string, sql: string, parameters?: SQLiteParameter[]): Promise<SQLiteQueryResult<R>>;
  close(id: string): Promise<void>;
  /** Close and remove the underlying database file. */
  delete(id: string): Promise<void>;
}

let sqliteServer: SQLiteServer | undefined;

/** Called by the main process at boot to inject the real SQLite implementation. */
export function registerSQLiteServer(server: SQLiteServer): void {
  sqliteServer = server;
}

function requireSQLite(): SQLiteServer {
  if (!sqliteServer) throw new Error("SQLite server not registered (main boot incomplete)");
  return sqliteServer;
}

// ---------------------------------------------------------------------------
// Compressor — matches upstream apps/web/src/utils/compressor.ts (desktop path)
// ---------------------------------------------------------------------------

export interface CompressorServer {
  gzip(data: string, level?: number): Promise<string>;
  gunzip(data: string): Promise<string>;
}

let compressorServer: CompressorServer | undefined;
export function registerCompressorServer(server: CompressorServer): void {
  compressorServer = server;
}
function requireCompressor(): CompressorServer {
  if (!compressorServer) throw new Error("Compressor server not registered (main boot incomplete)");
  return compressorServer;
}

// ---------------------------------------------------------------------------
// Safe storage — Electron `safeStorage` (OS keychain) for bootstrap secrets
// like the databaseKey. Main persists the encrypted blobs to a file.
// ---------------------------------------------------------------------------

export interface SafeStorageServer {
  isEncryptionAvailable(): Promise<boolean>;
  /** Encrypt `value` with safeStorage and persist under `key`. */
  set(key: string, value: string): Promise<void>;
  /** Read and decrypt the value stored under `key` (undefined if absent). */
  get(key: string): Promise<string | undefined>;
  remove(key: string): Promise<void>;
}

let safeStorageServer: SafeStorageServer | undefined;
export function registerSafeStorageServer(server: SafeStorageServer): void {
  safeStorageServer = server;
}
function requireSafeStorage(): SafeStorageServer {
  if (!safeStorageServer) throw new Error("Safe storage server not registered (main boot incomplete)");
  return safeStorageServer;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const appRouter = t.router({
  // Connectivity smoke check — renderer calls this to confirm the bridge is
  // wired before attempting any real procedure.
  ping: t.procedure.query(() => ({ ok: true as const, ts: Date.now() })),

  // Renderer → main stdout log. A minimal dev diagnostic so bootstrap can
  // report Database init progress/failure to the main process console (the
  // renderer's own console is only visible in DevTools).
  log: t.procedure
    .input(z.object({ level: z.enum(["info", "warn", "error"]), message: z.string() }))
    .mutation(({ input }) => {
      const fn = input.level === "error" ? console.error : input.level === "warn" ? console.warn : console.log;
      fn(`[renderer] ${input.message}`);
      return { ok: true as const };
    }),

  // Window management — matches upstream apps/desktop/src/api/window.ts
  window: t.router({
    open: t.procedure
      .input(
        z.object({
          url: z.string().url().optional(),
          singleNote: z.boolean().optional(),
          noteId: z.string().optional()
        })
      )
      .mutation(() => ({ ok: true as const })),
    maximize: t.procedure.mutation(() => ({ ok: true as const })),
    restore: t.procedure.mutation(() => ({ ok: true as const })),
    minimize: t.procedure.mutation(() => ({ ok: true as const })),
    fullscreen: t.procedure.query(() => false),
    list: t.procedure.query(() => [] as Array<{ id: number; title: string }>)
  }),

  // SQLite — matches upstream apps/desktop/src/api/sqlite-kysely.ts
  sqlite: t.router({
    open: t.procedure
      .input(z.object({ filePath: z.string() }))
      .mutation(({ input }) => requireSQLite().open(input.filePath)),
    run: t.procedure
      .input(
        z.object({
          id: z.string(),
          sql: z.string(),
          parameters: z.array(z.custom<SQLiteParameter>()).optional()
        })
      )
      .mutation(({ input }) =>
        requireSQLite().run(input.id, input.sql, input.parameters)
      ),
    close: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => requireSQLite().close(input.id)),
    delete: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => requireSQLite().delete(input.id))
  }),

  // Compressor — node zlib in main
  compress: t.router({
    gzip: t.procedure
      .input(z.object({ data: z.string(), level: z.number().optional() }))
      .mutation(({ input }) => requireCompressor().gzip(input.data, input.level)),
    gunzip: t.procedure
      .input(z.object({ data: z.string() }))
      .mutation(({ input }) => requireCompressor().gunzip(input.data))
  }),

  // Safe storage — OS keychain for bootstrap secrets (databaseKey)
  safeStorage: t.router({
    isEncryptionAvailable: t.procedure.query(() => requireSafeStorage().isEncryptionAvailable()),
    set: t.procedure
      .input(z.object({ key: z.string(), value: z.string() }))
      .mutation(({ input }) => requireSafeStorage().set(input.key, input.value)),
    get: t.procedure
      .input(z.object({ key: z.string() }))
      .query(({ input }) => requireSafeStorage().get(input.key)),
    remove: t.procedure
      .input(z.object({ key: z.string() }))
      .mutation(({ input }) => requireSafeStorage().remove(input.key))
  }),

  // Updater — matches upstream apps/desktop/src/api/updater.ts
  updater: t.router({
    check: t.procedure.query(() => ({ available: false, version: null as string | null })),
    download: t.procedure.mutation(() => ({ ok: true as const })),
    install: t.procedure.mutation(() => ({ ok: true as const }))
  })
});

export type AppRouter = typeof appRouter;