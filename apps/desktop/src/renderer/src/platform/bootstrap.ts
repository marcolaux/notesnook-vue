/**
 * App bootstrap — runs on renderer start, before the UI is interactive.
 *
 * 1. Verifies the tRPC bridge is alive (`desktop.ping`).
 * 2. Constructs and initialises the `@notesnook/core` `Database` with the
 *    desktop platform (bridge Kysely dialect + real compressor + stub
 *    storage/fs for now — M6/M7/M8 swap the stubs for real impls).
 *
 * Status is forwarded to the main-process console via `desktop.log` so init
 * progress is visible outside DevTools.
 */
import { desktop } from "./desktop-bridge";
import { initDatabase, createDesktopPlatform } from "./database";
import type { Database } from "@notesnook-vue/contracts";

let database: Database | undefined;

export async function bootstrap(): Promise<Database> {
  // 1. Bridge smoke check.
  try {
    const pong = await desktop.ping.query();
    // eslint-disable-next-line no-console
    console.info("[bootstrap] tRPC bridge ok:", pong);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[bootstrap] tRPC bridge FAILED:", error);
    throw error;
  }

  // 2. Database init.
  try {
    const platform = await createDesktopPlatform();
    const db = await initDatabase(platform);
    database = db;
    await seedIfEmpty(db);
    await desktop.log.mutate({ level: "info", message: "database initialised" });
    return db;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await desktop.log
      .mutate({ level: "error", message: `database init failed: ${message}` })
      .catch(() => undefined);
    throw error;
  }
}

/** Seed a couple of welcome notes on a fresh database so the list isn't empty. */
async function seedIfEmpty(db: Database): Promise<void> {
  if ((await db.notes.all.count()) > 0) return;
  await db.notes.add({
    title: "Welcome to Notesnook Vue",
    content: { type: "tiptap", data: "<p>This is your first note, stored in a real encrypted SQLite database via @notesnook/core.</p>" }
  });
  await db.notes.add({
    title: "Phase 1 pipeline",
    content: { type: "tiptap", data: "<p>Renderer holds the Database; SQL is compiled by Kysely and forwarded over the tRPC bridge to Main's better-sqlite3-multiple-ciphers, which writes an encrypted .sql file in userData.</p>" }
  });
}

/** Returns the initialised Database singleton. Throws if bootstrap hasn't run. */
export function getDatabase(): Database {
  if (!database) throw new Error("Database not initialised — call bootstrap() first");
  return database;
}