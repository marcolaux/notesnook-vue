/**
 * M6 encryption verification — proves a `sqliteOptions.password` (the
 * `databaseKey` hex) actually encrypts the on-disk SQLite file via
 * `better-sqlite3-multiple-ciphers`' `PRAGMA key`. Deterministic, in-process,
 * no Electron: the same `db.setup({ sqliteOptions: { password } })` path the
 * renderer uses, but with kysely's built-in dialect over a temp file.
 *
 * Asserts:
 *  - With a password: the DB file does NOT start with the SQLite magic header
 *    (the whole file including the header is encrypted by SQLCipher).
 *  - Without a password: the DB file DOES start with the SQLite magic header
 *    (plain SQLite), as a control.
 */
import { describe, it, expect, afterEach } from "vitest";
import { SqliteDialect } from "@streetwriters/kysely";
import BetterSqlite from "better-sqlite3-multiple-ciphers";
import { gzipSync, gunzipSync } from "node:zlib";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ICompressor, SQLiteOptions } from "@notesnook-vue/contracts";
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

const SQLITE_MAGIC = "SQLite format 3";

const tempDirs: string[] = [];
function newTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "nn-vue-enc-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop() as string, { recursive: true, force: true });
});

function buildPlatform(filePath: string, password?: string): {
  sqliteOptions: SQLiteOptions;
  storage: StubStorage;
  fs: StubFileStorage;
  compressor: InProcessCompressor;
} {
  return {
    sqliteOptions: {
      dialect: () => {
        const instance = new BetterSqlite(filePath);
        instance.unsafeMode(true);
        return new SqliteDialect({ database: instance });
      },
      ...(password ? { password } : {}),
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

describe("M6: sqliteOptions.password encrypts the on-disk DB", () => {
  it("without a password the file is plain SQLite (magic header present)", async () => {
    const dir = newTempDir();
    const file = join(dir, "plain.sql");
    const db = await initDatabase(buildPlatform(file));
    await db.notes.add({ title: "plain note" });
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, SQLITE_MAGIC.length).toString("latin1")).toBe(SQLITE_MAGIC);
  });

  it("with a password the file is encrypted (no SQLite magic header)", async () => {
    const dir = newTempDir();
    const file = join(dir, "encrypted.sql");
    const db = await initDatabase(buildPlatform(file, "a1b2c3d4e5f60718293a4b5c6d7e8f90"));
    await db.notes.add({ title: "secret note" });
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, SQLITE_MAGIC.length).toString("latin1")).not.toBe(SQLITE_MAGIC);
    // the plaintext title must not appear verbatim in the encrypted file
    expect(bytes.toString("latin1")).not.toContain("secret note");
  });
});