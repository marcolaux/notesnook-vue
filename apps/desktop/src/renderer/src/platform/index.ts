/**
 * Platform implementation registry — the single place where the renderer
 * wires concrete implementations of @notesnook/core's platform interfaces.
 *
 * On desktop (Electron), SQLite/compression/safe-storage run in the main
 * process and are exposed via the tRPC AppRouter. On web they run in a Web
 * Worker (OPFS / sql.js / @notesnook/sodium).
 *
 * This file currently exports nothing concrete — it is the seam that will
 * grow as features land. Keeping it isolated means the rest of the renderer
 * never imports `@notesnook/core` platform bits directly; they go through here.
 */
export {};