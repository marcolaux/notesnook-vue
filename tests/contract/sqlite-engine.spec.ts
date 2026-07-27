/**
 * SQLite engine sanity test — confirms `better-sqlite3-multiple-ciphers` loads
 * and runs in node (native-module build is intact) and documents the built-in
 * FTS5 tokenizer set.
 *
 * M4 (done): core's migrations reference `better_trigram` + `html` tokenizers,
 * which are NOT built in — they come from the `sqlite-better-trigram` /
 * `sqlite3-fts5-html` loadable extensions, loaded by the app
 * (`apps/desktop/src/main/sqlite.ts`) and by the contract tests that run
 * migrations (`tests/contract/helpers/fts5-extensions.ts`). This file checks
 * the native module's *built-in* capabilities only (no extensions loaded);
 * the extension-loaded path is exercised by the real-db specs.
 *
 * This does NOT exercise `main/sqlite.ts` (that module imports Electron's `app`,
 * unavailable outside Electron); the engine wiring is verified via the running
 * app. Here we verify the underlying native dependency directly.
 */
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";

describe("better-sqlite3-multiple-ciphers (native module)", () => {
  it("loads and runs SELECT 1", () => {
    const db = new Database(":memory:").unsafeMode(true);
    const rows = db.prepare("SELECT 1 AS n").all() as Array<{ n: number }>;
    expect(rows).toEqual([{ n: 1 }]);
    db.close();
  });

  it("creates a table, inserts, and reads back", () => {
    const db = new Database(":memory:").unsafeMode(true);
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, title TEXT)");
    db.prepare("INSERT INTO t VALUES (?, ?)").run("n1", "Hello");
    const row = db.prepare("SELECT title FROM t WHERE id = ?").get("n1") as
      | { title: string }
      | undefined;
    expect(row?.title).toBe("Hello");
    db.close();
  });

  it("built-in FTS5 is available (porter tokenizer)", () => {
    const db = new Database(":memory:").unsafeMode(true);
    // `porter` is a built-in FTS5 tokenizer wrapper. This should succeed.
    db.exec("CREATE VIRTUAL TABLE ft USING fts5(content, tokenize='porter')");
    db.prepare("INSERT INTO ft VALUES (?)").run("hello world");
    const rows = db.prepare("SELECT content FROM ft WHERE ft MATCH ?").all("hello") as Array<{
      content: string;
    }>;
    expect(rows.length).toBe(1);
    db.close();
  });

  it("ships the built-in trigram tokenizer (SQLite >= 3.34)", () => {
    // SQLite 3.53.2 (bundled with better-sqlite3-multiple-ciphers@12) includes
    // `trigram` as a built-in FTS5 tokenizer. (Core's migrations use the custom
    // `better_trigram` instead — provided by the M4 loadable extension, not
    // built-in; see `helpers/fts5-extensions.ts`.)
    const db = new Database(":memory:").unsafeMode(true);
    expect(() =>
      db.exec(
        "CREATE VIRTUAL TABLE ft USING fts5(id, title, tokenize='porter trigram remove_diacritics 1')"
      )
    ).not.toThrow();
    db.close();
  });

  it("html tokenizer is NOT built-in (requires sqlite3-fts5-html extension)", () => {
    // Without the M4 `sqlite3-fts5-html` extension loaded, `html` is absent.
    // The extension-loaded path (app + real-db tests) makes this available.
    const db = new Database(":memory:").unsafeMode(true);
    expect(() =>
      db.exec("CREATE VIRTUAL TABLE fh USING fts5(x, tokenize='html')")
    ).toThrowError(/no such tokenizer: html/i);
    db.close();
  });

  it("db.transaction batches multiple statements atomically (Phase B primitive)", () => {
    // `SQLite.runBatch` (apps/desktop/src/main/sqlite.ts) wraps its statements
    // in `better-sqlite3`'s `db.transaction(fn)`, which this case exercises
    // directly (the `SQLite` class itself imports Electron's `app` and can't
    // run in Node). Pins the transaction primitive runBatch relies on: all
    // statements commit together, and a throwing statement rolls back the lot.
    const db = new Database(":memory:").unsafeMode(true);
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    const insert = db.prepare("INSERT INTO t (v) VALUES (?)");

    // Commit path: 3 inserts in one transaction → 3 rows.
    const commitBatch = db.transaction(() => {
      insert.run("a");
      insert.run("b");
      insert.run("c");
      return 3;
    });
    expect(commitBatch()).toBe(3);
    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM t").get() as { n: number }).n
    ).toBe(3);

    // Rollback path: a throwing statement undoes the earlier ones in the batch.
    const rollbackBatch = db.transaction(() => {
      insert.run("d");
      insert.run("e");
      throw new Error("boom");
    });
    expect(() => rollbackBatch()).toThrow("boom");
    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM t").get() as { n: number }).n
    ).toBe(3); // still 3 — d/e rolled back

    db.close();
  });
});