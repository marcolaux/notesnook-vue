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

const t = initTRPC.create();

// ---------------------------------------------------------------------------
// SQLite — matches upstream apps/desktop/src/api/sqlite-kysely.ts
// ---------------------------------------------------------------------------

/**
 * Values bindable as SQL parameters. Mirrors better-sqlite3's accepted types.
 * `bigint` is included because Kysely returns `numAffectedRows`/`insertId` as
 * bigint; Electron IPC uses structured clone, which serialises bigint natively.
 */
export type SQLiteParameter = number | string | Uint8Array | number[] | bigint | null;

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
  close(id: string): Promise<void>;
  /** Close and remove the underlying database file. */
  delete(id: string): Promise<void>;
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
  /** Version string of the available update, or `null` when none/up-to-date. */
  version: string | null;
  /** The update has been downloaded and is ready to install. */
  downloaded: boolean;
  /** Download progress 0–100 (0 when not downloading). */
  progress: number;
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
// Window server — native window/theme controls implemented in `src/main/window.ts`
// (Electron `nativeTheme`). Injected via `registerWindowServer`.
// ---------------------------------------------------------------------------
export interface WindowServer {
  /** Set the OS-native theme source (drives vibrancy/acrylic material). */
  setNativeTheme(mode: "light" | "dark" | "system"): void;
  /**
   * Open the shared Settings window (singleton). Focuses the existing window
   * if one is already open; otherwise creates it. Called from any app window.
   */
  openSettings(): void;
  /**
   * Open a note in its own window (torn off from a tab in another window).
   * Focuses the existing window for that note if one is alive; otherwise
   * creates one that boots the full shell into focus mode with the note open.
   * Called from any app window. See `src/main/note-window.ts`.
   */
  openNote(noteId: string): void;
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
  releaseTab(input: { noteId: string; startScreenX: number; startScreenY: number }): {
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
    openSettings: t.procedure.mutation(() => requireWindowServer().openSettings()),
    // Open a note in its own window (torn off from a tab). Focuses the existing
    // window for that note if alive; otherwise creates one that boots into
    // focus mode with the note open (see `src/main/note-window.ts`).
    openNote: t.procedure
      .input(z.object({ noteId: z.string() }))
      .mutation(({ input }) => requireWindowServer().openNote(input.noteId)),
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
      .mutation(({ input }) => requireWindowServer().releaseTab(input)),
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
    close: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => requireSQLite().close(input.id)),
    delete: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => requireSQLite().delete(input.id))
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
      .mutation(({ input }) => requireDialog().openFile(input.extensions))
  })
});

export type AppRouter = typeof appRouter;