/**
 * Repro for "lexical search finds no results when the search word is in the
 * TITLE". Exercises the real vendored-core FTS5 path end-to-end (the omnibar's
 * Exact tier calls `db.lookup.notesWithHighlighting`), against an in-process
 * `better-sqlite3-multiple-ciphers` DB with the `better_trigram` + `html` FTS5
 * tokenizer extensions loaded (mirroring `main/sqlite.ts`). No mocking.
 *
 * The omnibar contract test mocks `db.lookup`, so the title FTS path was never
 * exercised against real data — this fills that gap.
 */
import { describe, it, expect, afterEach } from "vitest";
import { SqliteDialect } from "@streetwriters/kysely";
import BetterSqlite from "better-sqlite3-multiple-ciphers";
import { loadFts5Extensions } from "./helpers/fts5-extensions";
import { gzipSync, gunzipSync } from "node:zlib";
import { mkdtempSync, rmSync } from "node:fs";
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

const tempDirs: string[] = [];
function newTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "nn-vue-search-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop() as string, { recursive: true, force: true });
});

async function newDb(): Promise<{ db: Awaited<ReturnType<typeof initDatabase>>; raw: BetterSqlite.Database }> {
  const dir = newTempDir();
  const file = join(dir, "search.sql");
  let raw!: BetterSqlite.Database;
  const sqliteOptions: SQLiteOptions = {
    dialect: () => {
      const instance = new BetterSqlite(file);
      instance.unsafeMode(true);
      loadFts5Extensions(instance);
      raw = instance;
      return new SqliteDialect({ database: instance });
    },
    journalMode: "WAL",
    synchronous: "normal",
    lockingMode: "exclusive",
    tempStore: "memory",
    cacheSize: -32000,
    pageSize: 8192
  };
  const db = await initDatabase({
    sqliteOptions,
    storage: new StubStorage(),
    fs: new StubFileStorage(),
    compressor: new InProcessCompressor()
  });
  return { db, raw };
}

describe("FTS title search (lexical Exact tier)", () => {
  it("finds a note by a word that appears ONLY in the title (notesWithHighlighting)", async () => {
    const { db } = await newDb();
    // Note whose title contains "capybara"; body is unrelated so a content-only
    // search could not surface it.
    const id = await db.notes.add({ title: "Capybara sighting report" });
    await db.content.add({ data: "nothing relevant here at all", noteId: id });

    const vg = await db.lookup.notesWithHighlighting(
      "capybara",
      db.notes.all,
      { sortBy: "relevance", sortDirection: "desc" }
    );
    const ids: string[] = [];
    for (let i = 0; i < vg.length; i++) {
      const got = await vg.item(i);
      if (got.item) ids.push(got.item.id);
    }
    expect(ids).toContain(id);
  });

  it("finds a note by a word that appears ONLY in the title (lookup.notes)", async () => {
    const { db } = await newDb();
    const id = await db.notes.add({ title: "Strawberry fields forever" });
    await db.content.add({ data: "totally unrelated body text", noteId: id });
    const ids = await db.lookup.notes("strawberry").ids();
    expect(ids).toContain(id);
  });

  it("still finds a note by a word in the body (content FTS sanity)", async () => {
    const { db } = await newDb();
    const id = await db.notes.add({ title: "boring title" });
    await db.content.add({ data: "the quick brown fox jumps", noteId: id });
    const ids = await db.lookup.notes("fox").ids();
    expect(ids).toContain(id);
  });

  it("finds a title match after the title is updated (trigger reindex)", async () => {
    const { db } = await newDb();
    const id = await db.notes.add({ title: "Old title" });
    await db.notes.add({ id, title: "Komodo dragon expedition" });
    const ids = await db.lookup.notes("komodo").ids();
    expect(ids).toContain(id);
  });

  it("REPRO: note created titleless then titled later — title FTS must find it", async () => {
    const { db } = await newDb();
    // Created with NO title (the ephemeral-draft path: note is inserted on
    // first content, before any title is typed).
    const id = await db.notes.add({ content: { type: "tiptap", data: "<p>just some body text here</p>" } });
    // Title added later via a title-only upsert (the app's setTitle path).
    await db.notes.add({ id, title: "Axolotl study notes" });

    // Body search still works (content_fts indexed on content add).
    expect(await db.lookup.notes("body").ids()).toContain(id);
    // Title search MUST also work — this is the reported bug.
    const titleIds = await db.lookup.notes("axolotl").ids();
    expect(titleIds).toContain(id);
  });

  it("REPRO: lowercase query must match a Capitalized title (case-insensitivity)", async () => {
    const { db } = await newDb();
    // Title is Capitalized; body does NOT contain the lowercase form, so a
    // content match is impossible — only a case-insensitive TITLE match can
    // surface this note for the lowercase query "meeting".
    const id = await db.notes.add({ title: "Meeting Notes Q3" });
    await db.content.add({ data: "agenda items follow up later", noteId: id });

    const ids = await db.lookup.notes("meeting").ids();
    expect(ids).toContain(id);
  });

  it("REPRO: lowercase query must match a Capitalized title via notesWithHighlighting", async () => {
    const { db } = await newDb();
    const id = await db.notes.add({ title: "Quarterly Review" });
    await db.content.add({ data: "misc body words here", noteId: id });

    const vg = await db.lookup.notesWithHighlighting(
      "quarterly",
      db.notes.all,
      { sortBy: "relevance", sortDirection: "desc" }
    );
    const ids: string[] = [];
    for (let i = 0; i < vg.length; i++) {
      const got = await vg.item(i);
      if (got.item) ids.push(got.item.id);
    }
    expect(ids).toContain(id);
  });

  it("REPRO+FIX: stale notes_fts (old notes not backfilled) is repaired by db.lookup.rebuild()", async () => {
    const { db, raw } = await newDb();
    // Two notes with distinct titles + bodies.
    const a = await db.notes.add({ title: "Himalayan trek journal" });
    await db.content.add({ data: "base camp elevation notes", noteId: a });
    const b = await db.notes.add({ title: "Sahara desert crossing" });
    await db.content.add({ data: "dune field observations", noteId: b });

    // Sanity: title search works before simulating staleness.
    expect(await db.lookup.notes("himalayan").ids()).toContain(a);
    // Simulate the reported state: notes_fts emptied (as if the backfill
    // migration never populated it for existing notes). content_fts is left
    // intact — mirroring "body search works, title search doesn't".
    raw.exec(`INSERT INTO notes_fts(notes_fts) VALUES('delete-all')`);
    // Title search now misses (the bug).
    expect(await db.lookup.notes("himalayan").ids()).not.toContain(a);
    // Body search still hits (content_fts untouched).
    expect(await db.lookup.notes("elevation").ids()).toContain(a);

    // The fix: rebuild backfills notes_fts from existing notes' titles.
    await db.lookup.rebuild();
    expect(await db.lookup.notes("himalayan").ids()).toContain(a);
    expect(await db.lookup.notes("sahara").ids()).toContain(b);
    // Body search still works after rebuild (idempotent, doesn't break content).
    expect(await db.lookup.notes("elevation").ids()).toContain(a);
  });
});