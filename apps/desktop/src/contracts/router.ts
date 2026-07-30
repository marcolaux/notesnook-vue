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
import {
  type ContextSession,
  type LayoutSnapshot,
  type WindowBounds,
  LayoutSnapshotSchema,
  WindowBoundsSchema
} from "./session-state";
import { AccountEntrySchema, type AccountEntry } from "./server-config";

const t = initTRPC.create();

// ---------------------------------------------------------------------------
// SQLite — matches upstream apps/desktop/src/api/sqlite-kysely.ts
// ---------------------------------------------------------------------------

/**
 * Values bindable as SQL parameters. Mirrors better-sqlite3's accepted types.
 * `bigint` is included because Kysely returns `numAffectedRows`/`insertId` as
 * bigint; Electron IPC uses structured clone, which serialises bigint natively.
 */
export type SQLiteParameter = number | string | Uint8Array | Float32Array | number[] | bigint | null;

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
  /**
   * Execute multiple write statements in a single SQL transaction
   * (`BEGIN … COMMIT`, `ROLLBACK` on any statement error). Collapses N
   * per-statement IPC round-trips into one and N auto-committed WAL fsyncs
   * into one. Used by the vector-search indexer for multi-chunk
   * `INSERT`/`UPDATE`/`DELETE` on `vec_notes` (Phase B transaction batching).
   */
  runBatch<R = unknown>(
    id: string,
    statements: { sql: string; parameters?: SQLiteParameter[] | undefined }[]
  ): Promise<SQLiteQueryResult<R>>;
  close(id: string): Promise<void>;
  /** Close and remove the underlying database file. */
  delete(id: string): Promise<void>;
  /**
   * Force-unlock a stuck database: release this process's connection (if any)
   * and delete the `-wal`/`-shm` journal sidecars so the next `open` rebuilds
   * them cleanly. Recovers from a crash/bug that left a torn journal holding
   * the lock. The main `.sql` file is kept; un-checkpointed WAL writes are
   * lost. The `id` is the same `filePath` passed to `open`.
   */
  forceUnlock(filePath: string): Promise<void>;
  /**
   * Close any open connection for `filePath` (if this process holds one) and
   * delete the underlying `.sql` file + its `-wal`/`-shm` journal sidecars.
   * Used by account removal (`removeAccount`) so an account's encrypted DB is
   * gone whether or not a window currently has it open. `filePath` is the same
   * `open` id (the requested filename; main resolves the real path under
   * `userData`). Safe whether or not the DB is currently open.
   */
  deleteContextDb(filePath: string): Promise<void>;
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
// File storage (attachments) — Main node-fs chunk store backing
// `@notesnook/streamable-fs`. The renderer's `NodeFSFileStore` forwards each
// chunk-store method here. `FSFile` mirrors streamable-fs's `File` metadata
// (plain, serialisable object) so contracts doesn't depend on streamable-fs.
// ---------------------------------------------------------------------------

export interface FSFile {
  filename: string;
  size: number;
  type: string;
  additionalData?: Record<string, unknown> | undefined;
}

export interface FileStorageServer {
  clear(): Promise<void>;
  setMetadata(filename: string, metadata: FSFile): Promise<void>;
  getMetadata(filename: string): Promise<FSFile | undefined>;
  deleteMetadata(filename: string): Promise<void>;
  writeChunk(chunkName: string, data: Uint8Array): Promise<void>;
  deleteChunk(chunkName: string): Promise<void>;
  readChunk(chunkName: string): Promise<Uint8Array | undefined>;
  chunkSize(chunkName: string): Promise<number>;
  listChunks(chunkPrefix: string): Promise<string[]>;
  list(): Promise<string[]>;
}

let fileStorageServer: FileStorageServer | undefined;
export function registerFileStorageServer(server: FileStorageServer): void {
  fileStorageServer = server;
}
function requireFileStorage(): FileStorageServer {
  if (!fileStorageServer) throw new Error("File storage server not registered (main boot incomplete)");
  return fileStorageServer;
}

// ---------------------------------------------------------------------------
// Updater — matches upstream apps/desktop/src/api/updater.ts
// ---------------------------------------------------------------------------
// Auto-update is a main-process capability (`electron-updater` only runs in a
// packaged, signed build — in dev it is a no-op). The renderer triggers +
// observes it through this structural server over the bridge; the impl lives
// in `src/main/updater.ts` and is injected via `registerUpdaterServer`.

/** Snapshot of the updater state. `progress` is 0–100 during a download. */
export interface UpdateStatus {
  /** An update newer than the running app was found. */
  available: boolean;
  /** Version string of the available update, the running app version when a
   *  check completed and found none, or `null` before any check has resolved. */
  version: string | null;
  /** The update has been downloaded and is ready to install. */
  downloaded: boolean;
  /** Download progress 0–100 (0 when not downloading). */
  progress: number;
  /** Release notes / changelog text from the update provider. */
  releaseNotes?: string | null;
}

export interface UpdaterServer {
  /** Check the update provider for a newer release. Returns the current
   *  status snapshot (no side effects beyond the network check). */
  check(): Promise<UpdateStatus>;
  /** Download the available update. Returns `true` on success. No-op (returns
   *  `false`) when no update is available or not packaged. */
  download(): Promise<boolean>;
  /** Quit and install the downloaded update. Returns `true` if the call was
   *  dispatched (the app then restarts). */
  install(): Promise<boolean>;
  /** Read the current status snapshot without a network check. */
  status(): Promise<UpdateStatus>;
}

let updaterServer: UpdaterServer | undefined;
export function registerUpdaterServer(server: UpdaterServer): void {
  updaterServer = server;
}
function requireUpdater(): UpdaterServer {
  if (!updaterServer) throw new Error("Updater server not registered (main boot incomplete)");
  return updaterServer;
}

// ---------------------------------------------------------------------------
// Upstream-release checker — ours (no upstream equivalent)
// ---------------------------------------------------------------------------
// Notifies the user when the vendored upstream (`streetwriters/notesnook`)
// ships a GitHub release newer than the one we developed against. The
// baseline release tag is baked at build time by
// `scripts/gen-upstream-baseline.mjs` into `upstream-baseline.generated.ts`;
// the impl (`src/main/upstream-checker.ts`) fetches the latest desktop-stable
// release from the GitHub API at runtime and compares semver via
// `contracts/upstream-semver.ts`. Never throws across the bridge — a network
// or parse failure is reported as an `error` status with `isNewer: false`.

/** Result of an upstream-release check. */
export interface UpstreamReleaseStatus {
  /** ISO timestamp the check was performed. */
  checkedAt: string;
  /** The release tag we developed against (baked at build time). */
  baselineTag: string;
  /** Latest desktop-stable release tag from GitHub, or `null` on error. */
  latestTag: string | null;
  /** ISO publish time of the latest release, if known. */
  latestPublishedAt: string | null;
  /** GitHub HTML URL for the latest release (for the "View release" action). */
  latestUrl: string | null;
  /** `true` iff `latestTag` is semver-newer than `baselineTag`. */
  isNewer: boolean;
  /** Failure reason, or `null` on success. */
  error: "network" | "rate-limit" | "parse" | null;
}

export interface UpstreamCheckerServer {
  /** Fetch the latest upstream release and compare against the baked baseline.
   *  Never throws — returns an `error` status on failure. */
  check(): Promise<UpstreamReleaseStatus>;
}

let upstreamCheckerServer: UpstreamCheckerServer | undefined;
export function registerUpstreamCheckerServer(server: UpstreamCheckerServer): void {
  upstreamCheckerServer = server;
}
function requireUpstreamChecker(): UpstreamCheckerServer {
  if (!upstreamCheckerServer) throw new Error("Upstream checker server not registered (main boot incomplete)");
  return upstreamCheckerServer;
}

// ---------------------------------------------------------------------------
// Remote changelog fetcher — ours (no upstream equivalent)
// ---------------------------------------------------------------------------
// The What's New window bakes `CHANGELOG.md` into the renderer at build time
// (`__CHANGELOG_CONTENT__`), so an installed build only ever knows its own
// version's notes. This server fetches the raw `CHANGELOG.md` from the app's
// own GitHub repo at runtime so the window can show the *newest* version's
// notes. Mirrors `upstream-checker.ts`: a plain `fetch` (no Electron import →
// works in dev + packaged, unit-testable by stubbing `global.fetch`), and it
// never throws across the bridge — a network/parse failure is reported as an
// `error` status with `text: null` so the renderer silently falls back to the
// baked changelog.

/** Result of a remote changelog fetch. */
export interface RemoteChangelog {
  /** Raw `CHANGELOG.md` text from the repo, or `null` on failure. The
   *  renderer parses the newest version section out of this with
   *  `formatBundledChangelog` (the regex lives in renderer `utils/markdown.ts`,
   *  so the main process stays free of cross-layer imports). */
  text: string | null;
  /** ISO timestamp the fetch was performed. */
  fetchedAt: string;
  /** Failure reason, or `null` on success. */
  error: "network" | "parse" | null;
}

export interface ChangelogFetcherServer {
  /** Fetch the raw `CHANGELOG.md` from the app's GitHub repo. Never throws —
   *  returns an `error` status on failure. */
  fetchLatest(): Promise<RemoteChangelog>;
}

let changelogFetcherServer: ChangelogFetcherServer | undefined;
export function registerChangelogFetcherServer(server: ChangelogFetcherServer): void {
  changelogFetcherServer = server;
}
function requireChangelogFetcher(): ChangelogFetcherServer {
  if (!changelogFetcherServer) throw new Error("Changelog fetcher server not registered (main boot incomplete)");
  return changelogFetcherServer;
}

// ---------------------------------------------------------------------------
// Spell-checker — matches upstream apps/desktop/src/api/spell-checker.ts
// ---------------------------------------------------------------------------
// Electron's `session` spell-check is a main-process capability. The renderer
// reads the available/enabled languages + the global enabled flag and toggles
// them through this structural server over the bridge; the impl lives in
// `src/main/spell-checker.ts` and is injected via `registerSpellCheckerServer`.
// The pure language table + resolution helpers live in `./spell-checker` so
// they are shared (main + renderer + tests) without Electron.

export type { Language } from "./spell-checker";
export {
  SPELLCHECKER_ENABLED_DEFAULT,
  languageName,
  resolveEnabledCodes,
  resolveLanguage,
  sortLanguages,
  toLanguage
} from "./spell-checker";
import type { Language } from "./spell-checker";

export interface SpellCheckerServer {
  /** Whether the global spell-checker is enabled (persisted main-side). */
  isEnabled(): Promise<boolean>;
  /** Languages the platform supports, as display-name-sorted descriptors. */
  languages(): Promise<Language[]>;
  /** Languages currently enabled for spell-checking (resolved to working codes). */
  enabledLanguages(): Promise<Language[]>;
  /** Set the enabled languages (codes are resolved against the available set). */
  setLanguages(codes: string[]): Promise<void>;
  /** Enable or disable the global spell-checker. Returns the new enabled state. */
  toggle(enabled: boolean): Promise<boolean>;
  /** Words in the user's custom spell-checker dictionary. */
  words(): Promise<string[]>;
  /** Remove a word from the custom dictionary. */
  deleteWord(word: string): Promise<void>;
}

let spellCheckerServer: SpellCheckerServer | undefined;
export function registerSpellCheckerServer(server: SpellCheckerServer): void {
  spellCheckerServer = server;
}
function requireSpellChecker(): SpellCheckerServer {
  if (!spellCheckerServer) throw new Error("Spell-checker server not registered (main boot incomplete)");
  return spellCheckerServer;
}

// ---------------------------------------------------------------------------
// Dialog server — Electron `dialog` showSave/showOpen + node `fs` write/read,
// for Backup & Export (write a `.nnbackup` to a user-chosen path; read one
// back for restore). Implemented in `src/main/dialog.ts` and injected via
// `registerDialogServer`. Unlike the `fs` chunk store (fixed attachment
// directory), this is a general user-chosen-path file API.
// ---------------------------------------------------------------------------
export interface DialogServer {
  /** Show a save dialog (default filename `defaultName`) and write `data`
   *  (UTF-8) to the chosen path. Returns `true` if written, `false` if the
   *  user cancelled. Rejects on a write error. */
  saveFile(defaultName: string, data: string): Promise<boolean>;
  /** Show an open dialog filtered to `extensions` (e.g. `["nnbackup","nnbackupz"]`)
   *  and read the chosen file as UTF-8. Returns `{ name, data }` or `undefined`
   *  if the user cancelled. Rejects on a read error. */
  openFile(extensions: string[]): Promise<{ name: string; data: string } | undefined>;
  /** Show a directory picker dialog. Returns selected folder path or `undefined` if cancelled. */
  selectDirectory(): Promise<string | undefined>;
  /** Write `data` directly to `dir/defaultName`. Returns `true` if written, rejects on error. */
  saveFileToDir(dir: string, defaultName: string, data: string): Promise<boolean>;
  /** Show a yes/no confirmation dialog. Returns `true` if the user chose the
   *  affirmative button, `false` otherwise (cancel or the negative button). The
   *  option fields are `string | undefined` for `exactOptionalPropertyTypes`
   *  compat with the zod-inferred bridge input. */
  confirm(
    message: string,
    options?: { title?: string | undefined; okLabel?: string | undefined; cancelLabel?: string | undefined }
  ): Promise<boolean>;
}

let dialogServer: DialogServer | undefined;
export function registerDialogServer(server: DialogServer): void {
  dialogServer = server;
}
function requireDialog(): DialogServer {
  if (!dialogServer) throw new Error("Dialog server not registered (main boot incomplete)");
  return dialogServer;
}

// ---------------------------------------------------------------------------
// Import-FS server — directory-scoped bulk read for the Settings → Import
// section (Standard Notes import). Implemented in `src/main/import-fs.ts` via
// node `fs/promises`. Unlike the `dialog` server (single user-picked UTF-8
// file) and the `fs` server (fixed-location attachment chunk store), this
// enumerates a user-chosen export folder and reads entries as bytes or UTF-8.
// Paths are enforced to stay inside the picked directory (traversal guard).
// ---------------------------------------------------------------------------
export interface ImportFsEntry {
  name: string;
  size: number;
  isDir: boolean;
}

export interface ImportFsServer {
  /** List entries directly under `dir` (non-recursive). Dotfiles are skipped. */
  list(dir: string): Promise<ImportFsEntry[]>;
  /** Recursively list every file under `dir`, with `name` as a path RELATIVE to
   *  `dir` (using `/` separators). Dotfiles are skipped at every level. The
   *  relative paths feed back into `readBytes`/`readUtf8`. Used by the importer
   *  to find note `.json` files and sibling media anywhere in the export tree. */
  listRecursive(dir: string): Promise<ImportFsEntry[]>;
  /** Read `dir/name` as bytes. `name` is enforced to stay inside `dir` (may be
   *  a relative subpath from `listRecursive`). */
  readBytes(dir: string, name: string): Promise<Uint8Array>;
  /** Read `dir/name` as UTF-8. `name` is enforced to stay inside `dir` (may be
   *  a relative subpath from `listRecursive`). */
  readUtf8(dir: string, name: string): Promise<string>;
}

let importFsServer: ImportFsServer | undefined;
export function registerImportFsServer(server: ImportFsServer): void {
  importFsServer = server;
}
function requireImportFs(): ImportFsServer {
  if (!importFsServer) throw new Error("Import-FS server not registered (main boot incomplete)");
  return importFsServer;
}

// ---------------------------------------------------------------------------
// Backup-FS server — directory-scoped reads + writes for the per-account
// auto-backup scheduler (`stores/auto-backup.ts`) and the restore flow
// (`stores/backup.ts`). Implemented in `src/main/backup-fs.ts`. Distinct from
// `ImportFsServer` (read-only bulk read for the importer) and the `dialog`
// router (single user-picked UTF-8 file): this is a directory-scoped API used to
// lay down each account's backup tree under the shared `backupDirectory` and to
// read it back on restore — writes (mkdir, write text/bytes, delete file/dir)
// plus reads (exists, read text/bytes, list). Each method takes `root` (the
// backup directory) plus a relative `path` so the impl re-derives containment
// statelessly — a crafted `path` ("../../etc/passwd") cannot escape `root`
// (mirrors `import-fs.ts`).
// ---------------------------------------------------------------------------
export interface BackupFsServer {
  /** Ensure `<root>/<path>` exists as a directory (recursive). `path` is
   *  enforced to stay inside `root`. */
  ensureDir(root: string, path: string): Promise<void>;
  /** Write UTF-8 text to `<root>/<path>` (overwrites). `path` is enforced to
   *  stay inside `root`. */
  writeFileText(root: string, path: string, data: string): Promise<void>;
  /** Write raw bytes to `<root>/<path>` (overwrites). Used for encrypted
   *  attachment blobs. `path` is enforced to stay inside `root`. */
  writeFileBytes(root: string, path: string, data: Uint8Array): Promise<void>;
  /** Test whether `<root>/<path>` exists (file or directory). Returns `false`
   *  on any missing path / stat error — never throws. `path` is enforced to stay
   *  inside `root`. Used by the dedup pool's skip-if-exists write rule. */
  exists(root: string, path: string): Promise<boolean>;
  /** Read UTF-8 text from `<root>/<path>`. `path` is enforced to stay inside
   *  `root`. Used by restore/GC to read the manifest + `.attachments_key`. */
  readFileText(root: string, path: string): Promise<string>;
  /** Read raw bytes from `<root>/<path>`. `path` is enforced to stay inside
   *  `root`. Used by restore to read encrypted attachment blobs back from the
   *  dedup pool. */
  readFileBytes(root: string, path: string): Promise<Uint8Array>;
  /** List entry names directly under `<root>/<path>` (non-recursive). Returns
   *  `[]` when the directory does not exist. `path` is enforced to stay inside
   *  `root`. */
  listDir(root: string, path: string): Promise<string[]>;
  /** Delete the file at `<root>/<path>`. Swallows a missing file. `path` is
   *  enforced to stay inside `root`. */
  deleteFile(root: string, path: string): Promise<void>;
  /** Recursively remove `<root>/<path>` (a backup directory). Swallows a missing
   *  directory. `path` is enforced to stay inside `root`. */
  removeDir(root: string, path: string): Promise<void>;
}

let backupFsServer: BackupFsServer | undefined;
export function registerBackupFsServer(server: BackupFsServer): void {
  backupFsServer = server;
}
function requireBackupFs(): BackupFsServer {
  if (!backupFsServer) throw new Error("Backup-FS server not registered (main boot incomplete)");
  return backupFsServer;
}

// ---------------------------------------------------------------------------
// Window server — native window/theme controls implemented in `src/main/window.ts`
// (Electron `nativeTheme`). Injected via `registerWindowServer`.
// ---------------------------------------------------------------------------
export interface WindowServer {
  /** Set the OS-native theme source (drives vibrancy/acrylic material). */
  setNativeTheme(mode: "light" | "dark" | "system"): void;
  /**
   * Open the shared Settings window (singleton). Focuses the existing window
   * if one is already open; otherwise creates it. Called from any app window.
   *
   * Optional `section` deep-links into a specific settings section (e.g.
   * `"updates"`) by appending `?section=<id>` to the loaded URL, which
   * `SettingsLayout.vue` reads on mount to seed its active section. Omitted by
   * callers that just want Settings opened at the default section.
   *
   * Optional `contextId` opens (or reloads) the Settings window pinned to a
   * specific account context via `?ctx=<id>`, so Settings operates on that
   * account's DB rather than the shared "last used" pointer. When the singleton
   * is already open on a different context, the window reloads to this one.
   * Omitted by callers with no known context (e.g. the app menu when no bound
   * window is focused) → Settings falls back to the shared pointer.
   */
  openSettings(section: string | undefined, contextId: string | undefined): void;
  /**
   * Open the shared Changelog window (singleton). Focuses the existing window
   * if alive; otherwise creates a dedicated window displaying release notes.
   */
  openChangelog(): void;

  /**
   * Open a note in its own window (torn off from a tab in another window).
   * Focuses the existing window for that note if one is alive; otherwise
   * creates one that boots the full shell into focus mode with the note open.
   * Called from any app window. See `src/main/note-window.ts`.
   *
   * Optional `bounds` restores a saved size/position (used when reopening note
   * windows from the last session); optional `contextId` lets main track the
   * note window's bounds under the opening account. Both omitted by callers
   * that don't restore (a user-initiated tear-off).
   */
  openNote(noteId: string, bounds?: WindowBounds | undefined, contextId?: string | undefined): void;
  /**
   * Open a NEW full-shell app window bound to `contextId` (a logged-in
   * account's `hashEmail`, or `"local"`). The window loads `?ctx=<contextId>`
   * so `bootstrap()` opens that account's own encrypted SQLite context — the
   * keystone of per-window multi-account (each window is its own renderer
   * process with its own `Database` singleton + `Hosts`). Used by the account
   * switcher's "Open in new window" action so several accounts can be open
   * simultaneously, one per window. See `src/main/account-window.ts`.
   */
  openAccountWindow(contextId: string, bounds?: WindowBounds | undefined): void;
  /**
   * Open a NEW window dedicated to signing into an account (the switcher's
   * "Add account" action). Boots the local context + `?signin=1` so the window
   * shows the login screen and the caller's window is left untouched. See
   * `src/main/account-window.ts`.
   */
  openSignInWindow(bounds?: WindowBounds | undefined): void;
  /**
   * Open a detached *pane* in its own window — a whole editor pane (a group leaf
   * + all its tabs) torn off from another window. Creates a `BrowserWindow` that
   * boots the full shell with `?window=pane&paneId=<id>`; the pane renderer
   * fetches its {@link LayoutSnapshot} via {@link getPaneSnapshot} and hydrates
   * it (reusing the main-window restore path). Main stores the snapshot in an
   * in-memory map keyed by `paneId` (the URL carries only the id, not the
   * snapshot). Optional `bounds` restores a saved size/position; optional
   * `contextId` lets main track the pane window under the opening account so it
   * reopens next run. See `src/main/pane-window.ts`.
   */
  openPaneWindow(
    snapshot: LayoutSnapshot,
    bounds?: WindowBounds | undefined,
    contextId?: string | undefined
  ): void;
  /**
   * Fetch the in-memory {@link LayoutSnapshot} for a pane window id (the one
   * main generated and passed as `?window=pane&paneId=<id>`). Returns `null`
   * when the id is unknown (the window opened after a main restart, or the
   * snapshot was already consumed/evicted) — the pane renderer then re-`init()`s
   * an empty root pane.
   */
  getPaneSnapshot(paneId: string): LayoutSnapshot | null;
  /**
   * Resolve a *pane* drag that started at `(startScreenX, startScreenY)` (OS
   * screen coordinates, captured in the renderer at the pane-grip `dragstart`)
   * at release. Same geometry logic as {@link releaseTab} (reuses
   * `resolveTabRelease`), but carries the whole pane {@link LayoutSnapshot}
   * alongside so main can hand it to the target window or a new pane window:
   *  - `"none"` → ended inside the source window (no within-window pane drop
   *    targets exist, so this is a cancelled/within-window grip drop);
   *  - `"moved"` → ended over a DIFFERENT app window: main forwards
   *    `app:open-pane-at` (with the snapshot + client coords) so the target
   *    imports the pane's tabs as a new split sibling, and the source closes the
   *    pane;
   *  - `"toreOff"` → ended outside every window: main opens a new pane window
   *    with the snapshot.
   * Returns `{ action }` so the renderer closes the source pane only when the
   * move/tear-off actually happened.
   */
  releasePane(
    input: {
      snapshot: LayoutSnapshot;
      groupId: string;
      startScreenX: number;
      startScreenY: number;
    },
    senderId?: number | undefined
  ): {
    action: "none" | "moved" | "toreOff";
  };
  /**
   * Resolve a tab drag that started at `(startScreenX, startScreenY)` (OS screen
   * coordinates, captured in the renderer at `dragstart`) at release:
   *  - `"none"` → ended inside the source window (a within-window drop the
   *    renderer already handled);
   *  - `"moved"` → ended over a DIFFERENT app window: main forwards `app:open-note`
   *    to that window so it opens the note as a tab, and the source closes its tab;
   *  - `"toreOff"` → ended outside every window: main tears the tab off into a new
   *    note window.
   * The decision is made in the main process because `dragend`'s `screenX/screenY`
   * are unreliable on macOS when the drop lands outside the window on a native
   * surface (Finder reports 0,0 / the start position), and because HTML5
   * `dataTransfer` does not cross Electron windows — a drop on another window's
   * tab bar / drop zone is invisible to it, so the cross-window move is routed
   * through main from the source's `dragend`. Main reads the live cursor via
   * `screen.getCursorScreenPoint()` and every window's OS bounds, then applies
   * the pure `resolveTabRelease` predicate. Returns `{ action }` so the
   * renderer closes the source tab only when the move/tear-off actually happened.
   */
  releaseTab(
    input: { noteId: string; startScreenX: number; startScreenY: number },
    senderId?: number | undefined
  ): {
    action: "none" | "moved" | "toreOff";
  };
  /**
   * Notify the main window that the shared DB was mutated from another window
   * (e.g. a backup imported, or a vault created/deleted, in the Settings
   * window). The main window reloads its notes/collections/vault/backup stores
   * in response (cross-window — core events are per-process, so the main
   * window's stores won't see the change otherwise). No-op if no main window.
   */
  notifyDataChanged(): void;
  /**
   * Broadcast `app:note-changed` for `noteId` to every *other* live window (every
   * window except `senderId`, the webContents id of the window that issued the save)
   * so an editor showing the same note in another window reloads to the latest saved
   * content. `senderId === undefined` notifies all live windows. Cross-window because
   * core events are per-process (each window owns its own `Database` + eventManager),
   * so a save in one window is invisible to the others without this relay. See
   * `src/main/window.ts` + the pure `selectBroadcastTargets` in
   * `contracts/note-broadcast.ts`.
   */
  notifyNoteChanged(noteId: string, senderId: number | undefined): void;
  /**
   * Close the focused app window. A torn-off note window (`?window=note`)
   * calls this on itself when its last editor tab is closed while focus mode is
   * still on — the window exists only to host that one note, so once it's gone
   * the window goes too. If the user disabled focus mode the window becomes a
   * regular editing surface and the renderer does NOT call this. No-op if no
   * window is focused (defensive — the calling window is focused in practice).
   */
  close(): void;
}
let windowServer: WindowServer | undefined;
export function registerWindowServer(server: WindowServer): void {
  windowServer = server;
}
function requireWindowServer(): WindowServer {
  if (!windowServer) throw new Error("Window server not registered (main boot incomplete)");
  return windowServer;
}

// ---------------------------------------------------------------------------
// Session server — persists the editor session (open tabs + split layout,
// torn-off note windows, window bounds) to a local `userData/session.json`,
// keyed per account. Implemented in `src/main/session-state.ts`. See
// `contracts/session-state.ts` for the persisted shape (local-only; NOT synced).
// ---------------------------------------------------------------------------
export interface SessionServer {
  /** Load the per-account session (main-window layout + note windows + main
   *  bounds). Returns an empty session when none is saved (fresh install). */
  loadLayout(contextId: string): Promise<ContextSession>;
  /** Persist the main window's layout snapshot (open tabs + splits + history). */
  saveLayout(contextId: string, snapshot: LayoutSnapshot): Promise<void>;
  /** Persist the main window's bounds. */
  saveWindowBounds(contextId: string, bounds: WindowBounds): Promise<void>;
  /** Persist a torn-off note window's bounds (upserted by noteId). */
  saveNoteWindowBounds(contextId: string, noteId: string, bounds: WindowBounds): Promise<void>;
  /** Persist a torn-off pane window's layout snapshot (upserted by paneId). The
   *  pane renderer owns its live layout and saves through this so its tabs
   *  reopen next run. */
  savePaneWindowLayout(contextId: string, paneId: string, snapshot: LayoutSnapshot): Promise<void>;
  /** Persist a torn-off pane window's bounds (upserted by paneId). */
  savePaneWindowBounds(contextId: string, paneId: string, bounds: WindowBounds): Promise<void>;
  /** Bind a window (identified by its webContents `senderId`) to a context so
   *  main-side geometry writes land under the right account. Called once on
   *  boot, before the first `saveLayout`. */
  bindContext(senderId: number | undefined, contextId: string): void;
}
let sessionServer: SessionServer | undefined;
export function registerSessionServer(server: SessionServer): void {
  sessionServer = server;
}
function requireSessionServer(): SessionServer {
  if (!sessionServer) throw new Error("Session server not registered (main boot incomplete)");
  return sessionServer;
}

// ---------------------------------------------------------------------------
// App-state server — origin-independent persistence for small renderer flags
// that MUST survive a renderer localStorage reset (the local-mode "Continue
// without account" choice, `skippedLogin`, is the login gate in local mode and
// is the sole such flag today). Stored in `userData/app-state.json` (main-
// owned, atomic write — mirrors `session-state.ts` / `spell-checker.ts`) so it
// is NOT subject to renderer localStorage leveldb loss/corruption on hard
// quit, nor to the renderer origin scoping that lost it on dev-port drift.
// Local-only; never synced. Implemented in `src/main/app-state.ts`.
// ---------------------------------------------------------------------------
export interface AppState {
  /** The "Continue without account" choice. `undefined` until the user has
   *  explicitly chosen (skip or sign-in) at least once. Authoritative across
   *  restarts in local mode — see `stores/auth.ts` `init()` reconcile.
   *  `| undefined` is required (not plain `?: boolean`) so zod's `.optional()`
   *  (which allows an explicit `undefined`) is assignable under
   *  `exactOptionalPropertyTypes` — see `set` mutation input below. */
  skippedLogin?: boolean | undefined;
  /** The interface locale (Phase 7.2). Mirrored to the main-owned
   *  `app-state.json` so the main process can read it synchronously at boot
   *  (before the renderer loads) to build a localized app menu / tray / window
   *  titles. `| undefined` for the same zod-optional reason as `skippedLogin`.
   *  The renderer's `localStorage` value is the primary store; this is the
   *  durable cross-origin mirror. */
  locale?: (import("./i18n").Locale) | undefined;
}

export interface AppStateServer {
  /** Read the persisted app state (an empty object when none is saved). */
  get(): Promise<AppState>;
  /** Merge `patch` into the persisted state (read-modify-write) and persist
   *  atomically. Returns the merged state. */
  set(patch: Partial<AppState>): Promise<AppState>;
}

/** Zod input for the `appState.set` mutation. Exported so tests + the renderer
 *  can validate a patch (e.g. the `locale` enum) without re-running the tRPC
 *  input parser. Mirrors `AppState` minus the `| undefined`-on-optional
 *  distinction zod's `.optional()` collapses. */
export const appStateSetInput = z.object({
  skippedLogin: z.boolean().optional(),
  locale: z.enum(["en", "de", "pseudo"]).optional()
});

let appStateServer: AppStateServer | undefined;
export function registerAppStateServer(server: AppStateServer): void {
  appStateServer = server;
}
function requireAppStateServer(): AppStateServer {
  if (!appStateServer) throw new Error("App-state server not registered (main boot incomplete)");
  return appStateServer;
}

// ---------------------------------------------------------------------------
// Account registry — the list of known (logged-in) accounts and their
// per-account server config, persisted to `userData/accounts.json` by
// `src/main/account-registry.ts`. Multi-account support: "local" is implicit
// (always present, not listed, not removable); each entry is a server-
// authenticated account with its own encrypted SQLite context. The renderer
// uses `list` to render the account switcher and `get` to resolve a window's
// server hosts at boot (`resolveHostsForContext`). Local-only; never synced;
// never through `db.settings`.
// ---------------------------------------------------------------------------
export interface AccountRegistryServer {
  /** All known accounts, newest-first by `lastUsed`. `local` is never listed. */
  list(): Promise<AccountEntry[]>;
  /** The entry for `contextId`, or `undefined` when unknown. */
  get(contextId: string): Promise<AccountEntry | undefined>;
  /** Insert or replace the entry for `entry.contextId` (upsert by contextId),
   *  bumping `lastUsed` to the supplied value. Returns the merged list. */
  upsert(entry: AccountEntry): Promise<AccountEntry[]>;
  /** Remove the entry for `contextId` (no-op when absent). Returns the merged
   *  list. Does NOT delete the account's DB/keychain — that is the renderer's
   *  `removeAccount` path (`sqlite.delete` + `clearContextKeys`). */
  remove(contextId: string): Promise<AccountEntry[]>;
}

let accountRegistryServer: AccountRegistryServer | undefined;
export function registerAccountRegistryServer(server: AccountRegistryServer): void {
  accountRegistryServer = server;
}
function requireAccountRegistryServer(): AccountRegistryServer {
  if (!accountRegistryServer) throw new Error("Account registry server not registered (main boot incomplete)");
  return accountRegistryServer;
}

// ---------------------------------------------------------------------------
// Shell server — OS-interaction capabilities for the attachment preview's
// "Open externally" action. Implemented in `src/main/shell.ts` and injected via
// `registerShellServer`. Kept separate from the `fs` chunk store (which is the
// fixed attachment directory with a strict name regex) — this writes arbitrary
// bytes to a temp dir under a UUID-prefixed, sanitised filename and opens the
// resulting path with the OS default handler (Electron `shell.openPath`).
// ---------------------------------------------------------------------------
export interface ShellServer {
  /** Write `data` to a unique temp file and return its absolute path. The
   *  filename is sanitised (path separators stripped) and placed under
   *  `<temp>/notesnook-attachments/<uuid>-<sanitised-filename>` so there's no
   *  collision with other attachments and no path traversal. */
  writeTemp(input: { filename: string; data: Uint8Array }): Promise<{ path: string }>;
  /** Open `path` with the OS default handler (Electron `shell.openPath`).
   *  Returns the error string from `shell.openPath` (empty on success). */
  openPath(input: { path: string }): Promise<string>;
}

let shellServer: ShellServer | undefined;
export function registerShellServer(server: ShellServer): void {
  shellServer = server;
}
function requireShell(): ShellServer {
  if (!shellServer) throw new Error("Shell server not registered (main boot incomplete)");
  return shellServer;
}

// ---------------------------------------------------------------------------
// Reminders — OS-notification scheduling for reminders. Implemented in
// `src/main/reminders.ts` via Electron `Notification` + `setTimeout`. The
// renderer computes each reminder's next fire time (core's
// `getUpcomingReminderTime`) and pushes the schedule here; main fires the
// notification + signals the renderer (`app:reminder-fired`) so it can
// reschedule repeats. Injected via `registerRemindersServer`.
// ---------------------------------------------------------------------------

/** One scheduled notification. The renderer builds these via
 *  `buildReminderSchedule` (pure, in `utils/reminders.ts`). `description` is
 *  optional; `exactOptionalPropertyTypes`-safe (undefined stripped upstream). */
export interface ScheduledReminder {
  id: string;
  title: string;
  /** Optional notification body. `undefined` is allowed (the renderer strips
   *  it when a reminder has no description); included for `exactOptionalPropertyTypes`
   *  compat with the zod-inferred bridge input (`z.string().optional()`). */
  description?: string | undefined;
  /** Optional note id linked to the reminder (via `db.relations`). When set,
   *  clicking the OS notification opens this note (`app:open-note`). `undefined`
   *  for standalone reminders; `exactOptionalPropertyTypes`-safe. */
  noteId?: string | undefined;
  /** Epoch ms when the notification should fire. Must be in the future. */
  fireAt: number;
}

export interface RemindersServer {
  /** Replace the active schedule with `items` (clears any existing timers).
   *  Items with a non-future `fireAt` are skipped (stale). Never throws — a
   *  failure to schedule one item does not abort the rest. */
  schedule(items: ScheduledReminder[]): Promise<void>;
  /** Clear all scheduled timers (e.g. before a re-push or on quit). */
  clear(): Promise<void>;
}

let remindersServer: RemindersServer | undefined;
export function registerRemindersServer(server: RemindersServer): void {
  remindersServer = server;
}
function requireReminders(): RemindersServer {
  if (!remindersServer) throw new Error("Reminders server not registered (main boot incomplete)");
  return remindersServer;
}

// ---------------------------------------------------------------------------
// Notifications — one-shot OS notifications (e.g. the auto-backup scheduler
// announcing a completed backup). Implemented in `src/main/notifications.ts`
// via Electron `Notification`. Distinct from `RemindersServer` (scheduled).
// Injected via `registerNotificationsServer`.
// ---------------------------------------------------------------------------

export interface NotificationsServer {
  /** Show an OS notification immediately. No-op when the OS doesn't support
   *  notifications. Never throws. `body` is `string | undefined` for
   *  `exactOptionalPropertyTypes` compat with the zod-inferred bridge input. */
  show(notification: { title: string; body?: string | undefined }): Promise<void>;
}

let notificationsServer: NotificationsServer | undefined;
export function registerNotificationsServer(server: NotificationsServer): void {
  notificationsServer = server;
}
function requireNotifications(): NotificationsServer {
  if (!notificationsServer) throw new Error("Notifications server not registered (main boot incomplete)");
  return notificationsServer;
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
    list: t.procedure.query(() => [] as Array<{ id: number; title: string }>),
    // Sync the OS-native theme (macOS vibrancy / Windows acrylic material)
    // to the renderer's `themeMode` so the window chrome matches the app
    // theme. Implemented in `src/main/window.ts` via `nativeTheme.themeSource`.
    setNativeTheme: t.procedure
      .input(z.enum(["light", "dark", "system"]))
      .mutation(({ input }) => requireWindowServer().setNativeTheme(input)),
    // Open the shared Settings window (singleton). Any app window calls this
    // to surface Settings in its own window (see `src/main/settings-window.ts`).
    openSettings: t.procedure
      .input(z.object({ section: z.string().optional(), contextId: z.string().optional() }).optional())
      .mutation(({ input }) => requireWindowServer().openSettings(input?.section, input?.contextId)),
    openChangelog: t.procedure
      .mutation(() => requireWindowServer().openChangelog()),

    // Open a note in its own window (torn off from a tab). Focuses the existing
    // window for that note if alive; otherwise creates one that boots into
    // focus mode with the note open (see `src/main/note-window.ts`). Optional
    // `bounds` restores a saved size/position (used when reopening note windows
    // from the last session); optional `contextId` lets main track the note
    // window under the opening account (it owns the same DB as the caller).
    openNote: t.procedure
      .input(
        z.object({
          noteId: z.string(),
          bounds: WindowBoundsSchema.optional(),
          contextId: z.string().optional()
        })
      )
      .mutation(({ input }) =>
        requireWindowServer().openNote(input.noteId, input.bounds, input.contextId)
      ),
    // Open a NEW full-shell window bound to `contextId` (an account's
    // `hashEmail`, or `"local"`). Loads `?ctx=<contextId>` so the new window's
    // `bootstrap()` opens that account's own encrypted context — per-window
    // multi-account (see `src/main/account-window.ts`). Used by the switcher's
    // "Open in new window" action.
    openAccountWindow: t.procedure
      .input(z.object({ contextId: z.string(), bounds: WindowBoundsSchema.optional() }))
      .mutation(({ input }) =>
        requireWindowServer().openAccountWindow(input.contextId, input.bounds)
      ),
    // Open a NEW login window (the switcher's "Add account" action). Boots the
    // local context + `?signin=1` so the login screen shows; the caller's window
    // is untouched (per-window multi-account). See `src/main/account-window.ts`.
    openSignInWindow: t.procedure
      .input(z.object({ bounds: WindowBoundsSchema.optional() }).optional())
      .mutation(({ input }) => requireWindowServer().openSignInWindow(input?.bounds)),
    // Open a detached pane (a group leaf + all its tabs) in its own window.
    // Main stores the snapshot in memory keyed by a generated paneId and opens
    // `?window=pane&paneId=<id>`; the pane renderer fetches it via `getPaneSnapshot`.
    // The zod-validated payload is cast to `LayoutSnapshot` (same optional-
    // `undefined` delta as `saveLayout` — safe after zod validation).
    openPaneWindow: t.procedure
      .input(
        z.object({
          snapshot: LayoutSnapshotSchema,
          bounds: WindowBoundsSchema.optional(),
          contextId: z.string().optional()
        })
      )
      .mutation(({ input }) =>
        requireWindowServer().openPaneWindow(
          input.snapshot as LayoutSnapshot,
          input.bounds,
          input.contextId
        )
      ),
    // Fetch the in-memory snapshot for a pane window id (the pane renderer's
    // boot-time hydration source). `null` when unknown → empty root pane.
    getPaneSnapshot: t.procedure
      .input(z.object({ paneId: z.string() }))
      .query(({ input }) => requireWindowServer().getPaneSnapshot(input.paneId)),
    // Resolve a dragged pane at release (move to another window / tear off / none).
    // Same geometry logic as `releaseTab`, carrying the pane snapshot alongside.
    releasePane: t.procedure
      .input(
        z.object({
          snapshot: LayoutSnapshotSchema,
          groupId: z.string(),
          startScreenX: z.number(),
          startScreenY: z.number()
        })
      )
      .mutation(({ ctx, input }) =>
        requireWindowServer().releasePane(
          {
            snapshot: input.snapshot as LayoutSnapshot,
            groupId: input.groupId,
            startScreenX: input.startScreenX,
            startScreenY: input.startScreenY
          },
          (ctx as { senderId?: number }).senderId
        )
      ),
    // Resolve a dragged tab at release (move to another window / tear off / none).
    // Main reads the live cursor + every window's OS bounds and applies the
    // pure `resolveTabRelease` predicate; moves the tab to the window under the
    // cursor (via `app:open-note`) or tears it off into a new note window when
    // the cursor is outside every window. Returns `{ action }` so the renderer
    // closes the source tab only when the move/tear-off actually happened.
    releaseTab: t.procedure
      .input(
        z.object({ noteId: z.string(), startScreenX: z.number(), startScreenY: z.number() })
      )
      .mutation(({ ctx, input }) =>
        requireWindowServer().releaseTab(input, (ctx as { senderId?: number }).senderId)
      ),
    // Notify the main window that the shared DB changed from another window
    // (backup import / vault action in Settings) so it reloads its stores.
    notifyDataChanged: t.procedure.mutation(() => requireWindowServer().notifyDataChanged()),
    // Broadcast a note save to every other window so an editor showing the same
    // note reloads. `ctx.senderId` (set by `createIPCHandler`'s createContext in
    // `src/main/ipc.ts`) identifies the originating window so it is excluded.
    notifyNoteChanged: t.procedure
      .input(z.object({ noteId: z.string() }))
      .mutation(({ ctx, input }) =>
        requireWindowServer().notifyNoteChanged(
          input.noteId,
          (ctx as { senderId?: number }).senderId
        )
      ),
    // Close the focused window. A torn-off note window calls this when its last
    // tab closes while focus mode is still on (see `WindowServer.close`).
    close: t.procedure.mutation(() => requireWindowServer().close())
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
    runBatch: t.procedure
      .input(
        z.object({
          id: z.string(),
          statements: z.array(
            z.object({
              sql: z.string(),
              parameters: z.array(z.custom<SQLiteParameter>()).optional()
            })
          )
        })
      )
      .mutation(({ input }) =>
        requireSQLite().runBatch(input.id, input.statements)
      ),
    close: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => requireSQLite().close(input.id)),
    delete: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => requireSQLite().delete(input.id)),
    forceUnlock: t.procedure
      .input(z.object({ filePath: z.string() }))
      .mutation(({ input }) => requireSQLite().forceUnlock(input.filePath)),
    deleteContextDb: t.procedure
      .input(z.object({ filePath: z.string() }))
      .mutation(({ input }) => requireSQLite().deleteContextDb(input.filePath))
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

  // File storage — node-fs chunk store for attachments (streamable-fs backing)
  fs: t.router({
    clear: t.procedure.mutation(() => requireFileStorage().clear()),
    setMetadata: t.procedure
      .input(z.object({ filename: z.string(), metadata: z.object({ filename: z.string(), size: z.number(), type: z.string(), additionalData: z.record(z.string(), z.unknown()).optional() }) }))
      .mutation(({ input }) => requireFileStorage().setMetadata(input.filename, input.metadata)),
    getMetadata: t.procedure
      .input(z.object({ filename: z.string() }))
      .query(({ input }) => requireFileStorage().getMetadata(input.filename)),
    deleteMetadata: t.procedure
      .input(z.object({ filename: z.string() }))
      .mutation(({ input }) => requireFileStorage().deleteMetadata(input.filename)),
    writeChunk: t.procedure
      .input(z.object({ chunkName: z.string(), data: z.custom<Uint8Array>((v) => v instanceof Uint8Array) }))
      .mutation(({ input }) => requireFileStorage().writeChunk(input.chunkName, input.data)),
    deleteChunk: t.procedure
      .input(z.object({ chunkName: z.string() }))
      .mutation(({ input }) => requireFileStorage().deleteChunk(input.chunkName)),
    readChunk: t.procedure
      .input(z.object({ chunkName: z.string() }))
      .query(({ input }) => requireFileStorage().readChunk(input.chunkName)),
    chunkSize: t.procedure
      .input(z.object({ chunkName: z.string() }))
      .query(({ input }) => requireFileStorage().chunkSize(input.chunkName)),
    listChunks: t.procedure
      .input(z.object({ chunkPrefix: z.string() }))
      .query(({ input }) => requireFileStorage().listChunks(input.chunkPrefix)),
    list: t.procedure.query(() => requireFileStorage().list())
  }),

  // Updater — matches upstream apps/desktop/src/api/updater.ts
  updater: t.router({
    check: t.procedure.query(() => requireUpdater().check()),
    download: t.procedure.mutation(() => requireUpdater().download()),
    install: t.procedure.mutation(() => requireUpdater().install()),
    status: t.procedure.query(() => requireUpdater().status())
  }),

  // Upstream-release checker — ours (no upstream equivalent). Fetches the
  // latest desktop-stable release from GitHub and compares against the baked
  // baseline. See `src/main/upstream-checker.ts`.
  upstreamChecker: t.router({
    check: t.procedure.query(() => requireUpstreamChecker().check())
  }),

  // Remote changelog fetcher — ours (no upstream equivalent). Fetches the raw
  // `CHANGELOG.md` from the app's GitHub repo so the What's New window can show
  // the newest version's notes (the baked `__CHANGELOG_CONTENT__` only knows
  // the installed version). See `src/main/changelog-fetcher.ts`.
  changelog: t.router({
    fetchLatest: t.procedure.query(() => requireChangelogFetcher().fetchLatest())
  }),

  // Spell-checker — matches upstream apps/desktop/src/api/spell-checker.ts
  spellChecker: t.router({
    isEnabled: t.procedure.query(() => requireSpellChecker().isEnabled()),
    languages: t.procedure.query(() => requireSpellChecker().languages()),
    enabledLanguages: t.procedure.query(() => requireSpellChecker().enabledLanguages()),
    setLanguages: t.procedure
      .input(z.array(z.string()))
      .mutation(({ input }) => requireSpellChecker().setLanguages(input)),
    toggle: t.procedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(({ input }) => requireSpellChecker().toggle(input.enabled)),
    words: t.procedure.query(() => requireSpellChecker().words()),
    deleteWord: t.procedure
      .input(z.string())
      .mutation(({ input }) => requireSpellChecker().deleteWord(input))
  }),

  // File dialogs — save/open a user-chosen file (Backup & Export). Implemented
  // in `src/main/dialog.ts` via Electron `dialog` + node `fs/promises`.
  dialog: t.router({
    saveFile: t.procedure
      .input(z.object({ defaultName: z.string(), data: z.string() }))
      .mutation(({ input }) => requireDialog().saveFile(input.defaultName, input.data)),
    openFile: t.procedure
      .input(z.object({ extensions: z.array(z.string()) }))
      .mutation(({ input }) => requireDialog().openFile(input.extensions)),
    selectDirectory: t.procedure.mutation(() => requireDialog().selectDirectory()),
    saveFileToDir: t.procedure
      .input(z.object({ dir: z.string(), defaultName: z.string(), data: z.string() }))
      .mutation(({ input }) =>
        requireDialog().saveFileToDir(input.dir, input.defaultName, input.data)
      ),
    confirm: t.procedure
      .input(
        z.object({
          message: z.string(),
          title: z.string().optional(),
          okLabel: z.string().optional(),
          cancelLabel: z.string().optional()
        })
      )
      .mutation(({ input }) =>
        requireDialog().confirm(input.message, {
          title: input.title,
          okLabel: input.okLabel,
          cancelLabel: input.cancelLabel
        })
      )
  }),

  // Import-FS — directory-scoped bulk read for the Settings → Import section
  // (Standard Notes import). Implemented in `src/main/import-fs.ts`.
  importFs: t.router({
    list: t.procedure
      .input(z.object({ dir: z.string() }))
      .query(({ input }) => requireImportFs().list(input.dir)),
    listRecursive: t.procedure
      .input(z.object({ dir: z.string() }))
      .query(({ input }) => requireImportFs().listRecursive(input.dir)),
    readBytes: t.procedure
      .input(z.object({ dir: z.string(), name: z.string() }))
      .query(({ input }) => requireImportFs().readBytes(input.dir, input.name)),
    readUtf8: t.procedure
      .input(z.object({ dir: z.string(), name: z.string() }))
      .query(({ input }) => requireImportFs().readUtf8(input.dir, input.name))
  }),

  // Backup-FS — directory-scoped writes for the per-account auto-backup
  // scheduler. Implemented in `src/main/backup-fs.ts`; containment-guarded.
  backupFs: t.router({
    ensureDir: t.procedure
      .input(z.object({ root: z.string(), path: z.string() }))
      .mutation(({ input }) => requireBackupFs().ensureDir(input.root, input.path)),
    writeFileText: t.procedure
      .input(z.object({ root: z.string(), path: z.string(), data: z.string() }))
      .mutation(({ input }) => requireBackupFs().writeFileText(input.root, input.path, input.data)),
    writeFileBytes: t.procedure
      .input(
        z.object({
          root: z.string(),
          path: z.string(),
          data: z.custom<Uint8Array>((v) => v instanceof Uint8Array)
        })
      )
      .mutation(({ input }) => requireBackupFs().writeFileBytes(input.root, input.path, input.data)),
    exists: t.procedure
      .input(z.object({ root: z.string(), path: z.string() }))
      .query(({ input }) => requireBackupFs().exists(input.root, input.path)),
    readFileText: t.procedure
      .input(z.object({ root: z.string(), path: z.string() }))
      .query(({ input }) => requireBackupFs().readFileText(input.root, input.path)),
    readFileBytes: t.procedure
      .input(z.object({ root: z.string(), path: z.string() }))
      .query(({ input }) => requireBackupFs().readFileBytes(input.root, input.path)),
    listDir: t.procedure
      .input(z.object({ root: z.string(), path: z.string() }))
      .query(({ input }) => requireBackupFs().listDir(input.root, input.path)),
    deleteFile: t.procedure
      .input(z.object({ root: z.string(), path: z.string() }))
      .mutation(({ input }) => requireBackupFs().deleteFile(input.root, input.path)),
    removeDir: t.procedure
      .input(z.object({ root: z.string(), path: z.string() }))
      .mutation(({ input }) => requireBackupFs().removeDir(input.root, input.path))
  }),

  // Shell — OS-interaction for the attachment preview's "Open externally"
  // action (write decrypted bytes to a temp file, open with the OS handler).
  // Implemented in `src/main/shell.ts` via Electron `shell.openPath` + node `fs`.
  shell: t.router({
    writeTemp: t.procedure
      .input(
        z.object({
          filename: z.string(),
          data: z.custom<Uint8Array>((v) => v instanceof Uint8Array)
        })
      )
      .mutation(({ input }) => requireShell().writeTemp(input)),
    openPath: t.procedure
      .input(z.object({ path: z.string() }))
      .mutation(({ input }) => requireShell().openPath(input))
  }),

  // Reminders — OS-notification scheduling. The renderer computes each
  // reminder's next fire time (core's `getUpcomingReminderTime`) and pushes the
  // schedule here; main sets a `setTimeout` per item + fires an Electron
  // `Notification`, then signals the renderer (`app:reminder-fired`) so it can
  // reschedule repeats / drop fired once-reminders. Implemented in
  // `src/main/reminders.ts`.
  reminders: t.router({
    schedule: t.procedure
      .input(
        z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            description: z.string().optional(),
            noteId: z.string().optional(),
            fireAt: z.number()
          })
        )
      )
      .mutation(({ input }) => requireReminders().schedule(input)),
    clear: t.procedure.mutation(() => requireReminders().clear())
  }),

  // Notifications — one-shot OS notifications. Implemented in
  // `src/main/notifications.ts` via Electron `Notification`.
  notifications: t.router({
    show: t.procedure
      .input(z.object({ title: z.string(), body: z.string().optional() }))
      .mutation(({ input }) => requireNotifications().show(input))
  }),

  // Session persistence — the editor session (open tabs + split layout, torn-off
  // note windows, window bounds), saved locally per account. Implemented in
  // `src/main/session-state.ts`; shape in `contracts/session-state.ts`.
  session: t.router({
    // Load the per-account session (main-window layout + note windows + main
    // bounds). Returns an empty session when none is saved.
    loadLayout: t.procedure
      .input(z.object({ contextId: z.string() }))
      .query(({ input }) => requireSessionServer().loadLayout(input.contextId)),
    // Persist the main window's layout snapshot. The zod-validated payload is
    // cast to the hand-written `LayoutSnapshot` (the store's canonical shape) —
    // the two differ only in optional-`undefined` markers under
    // `exactOptionalPropertyTypes`, which zod infers but the store types omit;
    // the cast is safe because zod already validated the structure.
    saveLayout: t.procedure
      .input(z.object({ contextId: z.string(), snapshot: LayoutSnapshotSchema }))
      .mutation(({ input }) =>
        requireSessionServer().saveLayout(input.contextId, input.snapshot as LayoutSnapshot)
      ),
    // Persist the main window's bounds.
    saveWindowBounds: t.procedure
      .input(z.object({ contextId: z.string(), bounds: WindowBoundsSchema }))
      .mutation(({ input }) => requireSessionServer().saveWindowBounds(input.contextId, input.bounds)),
    // Persist a torn-off note window's bounds (upserted by noteId).
    saveNoteWindowBounds: t.procedure
      .input(z.object({ contextId: z.string(), noteId: z.string(), bounds: WindowBoundsSchema }))
      .mutation(({ input }) =>
        requireSessionServer().saveNoteWindowBounds(input.contextId, input.noteId, input.bounds)
      ),
    // Persist a torn-off pane window's layout snapshot (upserted by paneId). The
    // pane renderer saves its live layout here so its tabs reopen next run.
    savePaneWindowLayout: t.procedure
      .input(z.object({ contextId: z.string(), paneId: z.string(), snapshot: LayoutSnapshotSchema }))
      .mutation(({ input }) =>
        requireSessionServer().savePaneWindowLayout(
          input.contextId,
          input.paneId,
          input.snapshot as LayoutSnapshot
        )
      ),
    // Persist a torn-off pane window's bounds (upserted by paneId).
    savePaneWindowBounds: t.procedure
      .input(z.object({ contextId: z.string(), paneId: z.string(), bounds: WindowBoundsSchema }))
      .mutation(({ input }) =>
        requireSessionServer().savePaneWindowBounds(input.contextId, input.paneId, input.bounds)
      ),
    // Bind the calling window to a context (by webContents senderId) so main-
    // side geometry writes land under the right account. Called once on boot.
    bindContext: t.procedure
      .input(z.object({ contextId: z.string() }))
      .mutation(({ ctx, input }) =>
        requireSessionServer().bindContext((ctx as { senderId?: number }).senderId, input.contextId)
      )
  }),

  // App-state — origin-independent persistence for small renderer flags that
  // must survive a renderer localStorage reset (`skippedLogin` today). Stored
  // in `userData/app-state.json` by `src/main/app-state.ts`. `get` is read at
  // boot by `stores/auth.ts` `init()` to reconcile the local-mode login gate;
  // `set` mirrors `writeSkipped`. See the `AppStateServer` contract above.
  // `locale` (Phase 7.2) is mirrored here so the main process can read it
  // synchronously at boot to build a localized app menu / tray / window titles.
  appState: t.router({
    get: t.procedure.query(() => requireAppStateServer().get()),
    set: t.procedure.input(appStateSetInput).mutation(({ input }) => requireAppStateServer().set(input))
  }),

  // Account registry — the list of known (logged-in) accounts + their
  // per-account server config, persisted to `userData/accounts.json`. The
  // renderer lists accounts for the switcher, looks one up to resolve a
  // window's server hosts at boot, upserts on login, and removes on account
  // removal. See `src/main/account-registry.ts` + `AccountRegistryServer`.
  accountRegistry: t.router({
    list: t.procedure.query(() => requireAccountRegistryServer().list()),
    get: t.procedure
      .input(z.object({ contextId: z.string() }))
      .query(({ input }) => requireAccountRegistryServer().get(input.contextId)),
    upsert: t.procedure
      .input(AccountEntrySchema)
      .mutation(({ input }) => requireAccountRegistryServer().upsert(input)),
    remove: t.procedure
      .input(z.object({ contextId: z.string() }))
      .mutation(({ input }) => requireAccountRegistryServer().remove(input.contextId))
  })
});

export type AppRouter = typeof appRouter;