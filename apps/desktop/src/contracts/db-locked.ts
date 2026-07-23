/**
 * Shared contract for the "database locked by another instance" boot failure.
 *
 * Pure (no Node-only imports) so both the main process (`src/main/sqlite.ts`)
 * and the renderer (`App.vue`) can import it via the `@contracts/db-locked`
 * alias.
 *
 * Why a message marker (not the SQLite `code`): the native `better-sqlite3`
 * `SqliteError` carries a `.code` (`"SQLITE_BUSY"`/`"SQLITE_BUSY_SNAPSHOT"`/
 * `"SQLITE_LOCKED"`…), but `.code` is an own enumerable property that is lost
 * crossing Electron IPC (structured clone of `Error` preserves only
 * `message`/`name`/`stack`/`cause`) and is stripped by `sqlite.ts`'s
 * `rewriteError`. So the error **message** is the only reliable channel from
 * main to renderer; main embeds this marker, the renderer matches it.
 */

/** Marker prefix main embeds in the thrown error message on a held-lock
 *  failure. The renderer matches this to render the friendly overlay. */
export const DB_LOCKED_MARKER = "DATABASE_LOCKED_BY_ANOTHER_INSTANCE";

/** True when `message` is a held-lock failure surfaced from main. */
export function isDatabaseLockedMessage(message: string): boolean {
  return message.includes(DB_LOCKED_MARKER);
}

export const DB_LOCKED_HEADLINE = "Another instance is using this database";
export const DB_LOCKED_BODY =
  "Notesnook is already running and holds the database lock. Close the other Notesnook window, then click Retry.";