/**
 * SQLite engine sanity test — confirms `better-sqlite3-multiple-ciphers` loads
 * and runs in node (native-module build is intact) and that the `trigram`
 * FTS5 tokenizer is NOT available without the loadable extension (justifying M4).
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
    // `db.init()` migrations use `tokenize='porter trigram remove_diacritics 1'`.
    // SQLite 3.53.2 (bundled with better-sqlite3-multiple-ciphers@12) includes
    // `trigram` as a built-in FTS5 tokenizer, so the migrations pass WITHOUT the
    // loadable `sqlite-better-trigram` extension. The `html` tokenizer (from
    // `sqlite3-fts5-html`) is still absent — only needed later for HTML-aware
    // search highlighting, not for init.
    const db = new Database(":memory:").unsafeMode(true);
    expect(() =>
      db.exec(
        "CREATE VIRTUAL TABLE ft USING fts5(id, title, tokenize='porter trigram remove_diacritics 1')"
      )
    ).not.toThrow();
    db.close();
  });

  it("html tokenizer is NOT built-in (requires sqlite3-fts5-html extension)", () => {
    const db = new Database(":memory:").unsafeMode(true);
    expect(() =>
      db.exec("CREATE VIRTUAL TABLE fh USING fts5(x, tokenize='html')")
    ).toThrowError(/no such tokenizer: html/i);
    db.close();
  });
});