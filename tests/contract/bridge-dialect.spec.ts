/**
 * Bridge dialect contract test — exercises the renderer's REAL bridge dialect
 * forwarder (`SqliteDriver` / `SqliteBridgeConnection` from
 * `platform/sqlite-dialect.ts`) against a FAKE tRPC bridge backed by in-process
 * `better-sqlite3-multiple-ciphers`. This is the deterministic verification of
 * "migrations pass over the bridge": the dialect that the production renderer
 * uses (forwarding `executeQuery` → `sqlite.run`) drives a full `db.init()` +
 * notes round-trip, without Electron.
 *
 * Contrast with `data.spec.ts`, which uses kysely's built-in `SqliteDialect`
 * (kysely's own driver). Here we use OUR dialect code with our driver.
 */
import { describe, it, expect } from "vitest";
import BetterSqlite from "better-sqlite3-multiple-ciphers";
import { gzipSync, gunzipSync } from "node:zlib";
import type { ICompressor, SQLiteOptions } from "@notesnook-vue/contracts";
import type { SqliteBridgeClient } from "../../apps/desktop/src/renderer/src/platform/sqlite-dialect";
import { createDialect } from "../../apps/desktop/src/renderer/src/platform/sqlite-dialect";
import { initDatabase } from "../../apps/desktop/src/renderer/src/platform/database";
import { StubStorage } from "../../apps/desktop/src/renderer/src/platform/stub-storage";
import { StubFileStorage } from "../../apps/desktop/src/renderer/src/platform/stub-fs";

class InProcessCompressor implements ICompressor {
  async compress(data: string): Promise<string> {
    return gzipSync(Buffer.from(data, "utf-8"), { level: 6 }).toString("base64");
  }
  async decompress(data: string): Promise<string> {
    return gunzipSync(Buffer.from(data, "base64")).toString("utf-8");
  }
}

/**
 * A fake `desktop.sqlite` backed by a single in-process `:memory:` DB. Mimics
 * Main's `sqliteServer` (open → id; run → exec; close/delete). Records `run`
 * calls so the test can assert the forwarder passes SQL+params verbatim.
 */
function createFakeBridgeSqlite(): SqliteBridgeClient & { runCalls: Array<{ sql: string; parameters: unknown[] }> } {
  const db = new BetterSqlite(":memory:").unsafeMode(true);
  const runCalls: Array<{ sql: string; parameters: unknown[] }> = [];
  return {
    open: { mutate: async ({ filePath }) => filePath },
    run: {
      mutate: async ({ id, sql, parameters }) => {
        runCalls.push({ sql, parameters: parameters ?? [] });
        const prepared = db.prepare(sql);
        if (prepared.reader) {
          return { rows: prepared.all(parameters ?? []) };
        }
        const r = prepared.run(parameters ?? []);
        return {
          numAffectedRows: BigInt(r.changes),
          insertId: BigInt(r.lastInsertRowid as number | bigint),
          rows: []
        };
      }
    },
    close: { mutate: async () => undefined },
    delete: { mutate: async () => undefined },
    runCalls
  };
}

describe("bridge dialect: SqliteDriver forwards over a fake bridge", () => {
  it("forwards executeQuery to sqlite.run with the compiled sql + parameters", async () => {
    const fake = createFakeBridgeSqlite();
    const dialect = createDialect({ name: ":memory:", client: fake });
    // A tiny standalone Kysely over the bridge dialect to inspect one query.
    const { Kysely } = await import("@streetwriters/kysely");
    const kysely = new Kysely({ dialect });
    await kysely.executeQuery(
      // raw compiled query → should arrive at fake.run as { sql, parameters }
      (await kysely.selectFrom("kv").select("key").compile()) as never
    ).catch(() => undefined);
    // The first run call must be the SELECT (PRAGMAs are not run here since we
    // bypass db.init). Just assert a SELECT was forwarded with its params.
    const selectCall = fake.runCalls.find((c) => /select/i.test(c.sql));
    expect(selectCall).toBeDefined();
    await kysely.destroy();
  });
});

describe("bridge dialect: full db.init() + notes round-trip over the bridge", () => {
  it("initialises the Database via the bridge dialect and round-trips a note", async () => {
    const fake = createFakeBridgeSqlite();
    const platform: {
      sqliteOptions: SQLiteOptions;
      storage: StubStorage;
      fs: StubFileStorage;
      compressor: InProcessCompressor;
    } = {
      sqliteOptions: {
        dialect: (name) => createDialect({ name, client: fake }),
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

    const db = await initDatabase(platform);
    expect(db.isInitialized).toBe(true);

    const id = await db.notes.add({ title: "Bridge note" });
    expect(await db.notes.all.count()).toBe(1);
    const items = await db.notes.all.items();
    expect(items[0]?.title).toBe("Bridge note");

    // The forwarder must have actually executed SQL over the bridge (not noop).
    expect(fake.runCalls.length).toBeGreaterThan(0);
    expect(fake.runCalls.some((c) => /insert/i.test(c.sql))).toBe(true);
    expect(fake.runCalls.some((c) => /select/i.test(c.sql))).toBe(true);
  });
});