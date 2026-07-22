/**
 * Load the M4 FTS5 tokenizer extensions (`sqlite-better-trigram` +
 * `sqlite3-fts5-html`) into a `better-sqlite3-multiple-ciphers` instance so
 * core's **unpatched** migrations — which reference the `better_trigram` +
 * `html` tokenizers — run in the contract-test environment the same way they
 * do in the app (see `apps/desktop/src/main/sqlite.ts`, which loads them after
 * the DB is first decrypted).
 *
 * Why this exists: the old `build-vendor.mjs` dist shims rewrote core's
 * migrations to use the stock `trigram` tokenizer so tests/app worked WITHOUT
 * the extensions. Now that we build core from source with zero patches (M4
 * provides the tokenizers at runtime), the migrations reference `better_trigram`
 * / `html` directly — so any environment that runs `db.init()` must load these
 * extensions first, or `CREATE VIRTUAL TABLE … tokenize='better_trigram …'`
 * throws `no such tokenizer: better_trigram`.
 *
 * Loading at instance creation (before `PRAGMA key`) is safe for the test
 * cases, which all use a fresh `:memory:` or fresh temp file (loadExtension is
 * process-level, not page-level; the app's "load after decrypt" note is about
 * re-opening an already-encrypted file, not a fresh one).
 *
 * Mirrors `main/sqlite.ts` `getExtensionPath` (minus the Electron `.asar`
 * rewrite, a no-op outside packaging). The per-platform binary packages are
 * `optionalDependencies` of `apps/desktop` and resolve from the project root
 * `node_modules`.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { statSync } from "node:fs";
import type BetterSqlite from "better-sqlite3-multiple-ciphers";

const require_ = createRequire(import.meta.url);

function getExtensionPath(extensionName: string, entryPoint: string): string {
  const os = process.platform === "win32" ? "windows" : process.platform;
  const packageName = `${extensionName}-${os}-${process.arch}`;
  const suffix =
    process.platform === "win32"
      ? "dll"
      : process.platform === "darwin"
        ? "dylib"
        : "so";
  const loadablePath = path.join(
    require_.resolve(extensionName),
    "..",
    "..",
    packageName,
    `${entryPoint}.${suffix}`
  );
  if (!statSync(loadablePath, { throwIfNoEntry: false }))
    throw new Error(`${extensionName} not found at ${loadablePath}.`);
  return loadablePath;
}

/**
 * Load both FTS5 tokenizer extensions into `db`. Call once, right after
 * `new BetterSqlite(…)` (and `unsafeMode(true)` if used), before the instance
 * is handed to `initDatabase` (which runs the migrations).
 */
export function loadFts5Extensions(db: BetterSqlite.Database): void {
  db.pragma("enable_load_extension = ON");
  db.loadExtension(getExtensionPath("sqlite-better-trigram", "better-trigram"));
  db.loadExtension(getExtensionPath("sqlite3-fts5-html", "fts5-html"));
}