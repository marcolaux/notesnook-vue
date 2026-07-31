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
import { injectTheme, ThemeDark } from "@notesnook-vue/theme-vue";
import type { Database } from "@notesnook-vue/contracts";
import { readServerConfig, resolveHosts, type Hosts } from "./server-config";
import { getAccount } from "./account-registry";
import {
  readCurrentContext,
  readWindowContext,
  isLocal,
  LOCAL_CONTEXT,
  type ContextId
} from "./account-context";
import { migrateLegacyDatabaseKeyIfNeeded } from "./key-store";
import { bindEventBridge } from "./event-bridge";
import { ensureLocalUser } from "./local-user";
import { makeId, type SettingItem } from "@notesnook-vue/contracts";

let database: Database | undefined;

/** The context id of the currently-open database (set during bootstrap/switch). */
let currentContext: ContextId = LOCAL_CONTEXT;

/** Returns the context id of the currently-open database. */
export function getCurrentContext(): ContextId {
  return currentContext;
}

/**
 * Resolve the concrete `Hosts` bag for a context. Per-window multi-account: an
 * account's server profile lives in the registry (so an upstream-notesnook
 * account and a self-hosted account can coexist), and each window's process
 * holds its own `Hosts` (core's `Hosts` is a per-process module singleton). We
 * look the account's `serverConfig` up by `contextId` and resolve it; the
 * local context (no server) and any account not yet in the registry fall back
 * to the shared `localStorage` `serverConfig` (back-compat — pre-multi-account
 * installs, and a brand-new account mid-login before `completeLogin` upserts).
 * Never throws — a registry/lookup failure falls back to the shared config.
 */
export async function resolveHostsForContext(contextId: ContextId): Promise<Hosts> {
  if (!isLocal(contextId)) {
    try {
      const entry = await getAccount(contextId);
      if (entry) return resolveHosts(entry.serverConfig);
    } catch {
      /* registry unavailable — fall back to the shared config below */
    }
  }
  return resolveHosts(readServerConfig());
}

export async function bootstrap(contextId?: ContextId): Promise<Database> {
  // 0. Theme — inject before anything else so the first paint is already
  // themed. `injectTheme` writes the vendored `themeToCSS` output (scoped
  // `.theme-scope-*` vars) + glassmorphism vars + the Tailwind `:root` bridge
  // into a single `<style id="nn-theme">`, and applies `.theme-scope-base-
  // primary` + `color-scheme` to <html>. `setTheme()` switches it at runtime.
  injectTheme(ThemeDark);

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

  // 2. Database init. Resolve the persisted server config (default Notesnook
  // servers, or a self-hosted bag chosen at the login screen) before init —
  // `db.host()` must run before `db.init()`. Open the *current context's* DB
  // (local mode, or a logged-in account) — each context has its own encrypted
  // SQLite file + keychain key + IndexedDB KV (see `account-context.ts`).
  try {
    // Per-window context: each window is its own renderer process; main stamps
    // `?ctx=<id>` on note/pane/account windows so they open that account's own
    // encrypted SQLite context. The default first/main window (and Settings/
    // Changelog) pass no `ctx` → fall back to the shared `localStorage`
    // `currentContext` pointer (the last-used account, or `"local"`).
    const ctx = contextId ?? readWindowContext() ?? readCurrentContext();
    currentContext = ctx;
    // One-time legacy migration: adopt the pre-per-context single DB
    // (`notesnook.sql` + global `databaseKey`) as the local context's DB. The
    // file rename is main-side (at startup); here we copy the keychain key so
    // `getDatabaseKey("local")` retrieves the legacy key. No-op once migrated
    // or for account contexts.
    if (isLocal(ctx)) {
      await migrateLegacyDatabaseKeyIfNeeded(LOCAL_CONTEXT);
    }
    const serverHosts = await resolveHostsForContext(ctx);
    const platform = await createDesktopPlatform(ctx);
    const db = await initDatabase(platform, serverHosts);
    database = db;
    // Bridge the Database's instance-local event bus to the global `EV` so the
    // renderer stores' sync/vault/session-expiry subscriptions fire (re-bound
    // on every switchContext below — a new Database has a new eventManager).
    bindEventBridge(db);
    await seedIfEmpty(db, ctx);
    // Local mode has no server login, so `db.attachments` (which needs a user
    // master key) would throw on save. Synthesise a local user + derive a master
    // key so drag-and-drop / paste of images works in local mode too. Account
    // contexts get a real user via login. Idempotent + offline (no network).
    if (isLocal(ctx)) await ensureLocalUser(db);
    await desktop.log.mutate({ level: "info", message: `database initialised (context: ${ctx})` });

    // Schedule background idle vector search catch-up indexing for unindexed
    // notes. `migrateEmbeddingModelIfNeeded` purges + re-indexes once if the
    // configured embedding model has changed (e.g. the multilingual granite
    // swap), otherwise it just runs the ordinary catch-up scan.
    const triggerScanner = (): void => {
      import("@/utils/vector-search")
        .then(({ migrateEmbeddingModelIfNeeded }) => {
          void migrateEmbeddingModelIfNeeded();
        })
        .catch(() => undefined);
    };

    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(triggerScanner);
    } else {
      setTimeout(triggerScanner, 2000);
    }

    return db;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await desktop.log
      .mutate({ level: "error", message: `database init failed: ${message}` })
      .catch(() => undefined);
    throw error;
  }
}

/**
 * Live-swap the database singleton to a different context. Constructs a fresh
 * `@notesnook/core` `Database` against the new context's file/key/IndexedDB and
 * replaces the singleton — used by `auth.login` to authenticate *into* the
 * account DB (so the local DB is never authenticated, keeping local and
 * account data separate). Stores re-resolve `getDatabase()` per action, so
 * they pick up the swap on their next call.
 *
 * The previous `Database` JS object is orphaned (core has no teardown). Its
 * instance-local `eventManager` (and the bridge subscriptions bound on it
 * above) die with it — GC-eligible together, no leak on the global `EV` bus.
 * The new Database gets a fresh `bindEventBridge` so sync/vault/session events
 * keep reaching the stores. The previous context's SQLite file handle stays
 * open in Main's `databases` map and is reused when you switch back to it.
 */
export async function switchContext(contextId: ContextId): Promise<Database> {
  const serverHosts = await resolveHostsForContext(contextId);
  const platform = await createDesktopPlatform(contextId);
  const db = await initDatabase(platform, serverHosts);
  database = db;
  currentContext = contextId;
  // Re-bind the event bridge to the new Database's instance-local eventManager
  // (the old Database's bridge died with it — see the doc comment above).
  bindEventBridge(db);
  // Local context (e.g. on logout back to local) needs the synthesised local
  // user + master key for `db.attachments`; account contexts get a real user.
  if (isLocal(contextId)) await ensureLocalUser(db);
  return db;
}

/**
 * Persistent "already seeded" flag stored in `db.settings` (a single row under
 * the namespaced key `custom:seeded`). Seeding must run at most ONCE per
 * database — we gate on this flag, NOT on note count. A user who deletes the
 * welcome notes would otherwise trip the old `notes.count() > 0` guard (count
 * drops to 0) and re-trigger seeding, and `db.tags.add` throws on the
 * duplicate "phase-3" title — surfacing as a startup error. The flag is tied
 * to the DB (wiped if the DB is wiped, so a truly fresh DB re-seeds), and uses
 * the same `db.settings.collection` bypass as `stores/notebook-icons.ts`
 * (stock `Settings.set/get` are private + reject unknown keys).
 */
const SEEDED_KEY = "custom:seeded";
const SEEDED_ROW_ID = makeId(SEEDED_KEY);

/** True if this DB has already been seeded (the flag row is present). */
function isSeeded(db: Database): boolean {
  const item = db.settings.collection.get(SEEDED_ROW_ID);
  return !!item && item.value === "1";
}

/** Mark this DB as seeded so `seedIfEmpty` never runs again. Never throws. */
async function markSeeded(db: Database): Promise<void> {
  try {
    const old = db.settings.collection.get(SEEDED_ROW_ID);
    await db.settings.collection.upsert({
      id: SEEDED_ROW_ID,
      // Custom namespaced key; not in SettingItemMap, so cast (bypass path).
      key: SEEDED_KEY as SettingItem["key"],
      value: "1",
      type: "settingitem",
      dateCreated: old?.dateCreated ?? Date.now(),
      dateModified: Date.now()
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[bootstrap] markSeeded failed:", e);
  }
}

/**
 * Seed a couple of welcome notes on a fresh *local* database so the list isn't
 * empty in local mode. Account DBs are never seeded — they start empty and fill
 * from the server via sync (the user's "keep separate" choice: local data lives
 * only in local mode, account data comes from the server).
 */
async function seedIfEmpty(db: Database, contextId: ContextId): Promise<void> {
  if (!isLocal(contextId)) return; // accounts start empty — sync fills them
  // Authoritative gate: seed at most once per DB.
  if (isSeeded(db)) return;
  // Upgrade path: an install from before the flag existed may already hold
  // seed data — most commonly the user deleted the welcome notes but the
  // "phase-3" tag survived (the exact duplicate-tag startup error). Treat any
  // existing notes/tags/notebooks as "already seeded": mark the flag and bail
  // without re-seeding (which would throw on the duplicate tag). A genuinely
  // fresh local DB has none of these, so it still seeds.
  if (
    (await db.notes.all.count()) > 0 ||
    (await db.tags.all.count()) > 0 ||
    (await db.notebooks.all.count()) > 0
  ) {
    await markSeeded(db);
    return;
  }
  await db.notes.add({
    title: "Welcome to Notesnook Vue",
    content: { type: "tiptap", data: "<p>This is your first note, stored in a real encrypted SQLite database via @notesnook/core.</p>" }
  });
  await db.notes.add({
    title: "Phase 1 pipeline",
    content: { type: "tiptap", data: "<p>Renderer holds the Database; SQL is compiled by Kysely and forwarded over the tRPC bridge to Main's better-sqlite3-multiple-ciphers, which writes an encrypted .sql file in userData.</p>" }
  });
  // Phase 3.2 demo — a notebook + a tag so the sidebar's Notebooks/Tags
  // sections show real collections. Group the two welcome notes under the
  // notebook and tag them so the collection filter (notebook → its notes,
  // tag → its notes via db.relations) shows notes on-device.
  const nbId = await db.notebooks.add({ title: "Getting started" });
  const welcomeNotes = (await db.notes.all.items()).slice(0, 2).map((n) => n.id);
  if (nbId) await db.notes.addToNotebook(nbId, ...welcomeNotes);
  // Sub-notebook demo — a child notebook under "Getting started" linked
  // parent→child via db.relations (sub-notebooks are nested notebooks, not
  // Topics — Notebook.topics is @deprecated). Adding a welcome note to the
  // child too exercises `db.notebooks.notes(parentId)` descendant recursion
  // (selecting the parent filters to parent+child notes). Local-only.
  const childId = await db.notebooks.add({ title: "Sub-topic" });
  if (childId && nbId) {
    await db.relations.add({ type: "notebook", id: nbId }, { type: "notebook", id: childId });
    const secondNote = welcomeNotes[1];
    if (secondNote) await db.notes.addToNotebook(childId, secondNote);
  }
  const tagId = await db.tags.add({ title: "phase-3" });
  if (tagId) {
    for (const noteId of welcomeNotes) {
      await db.relations.add({ type: "note", id: noteId }, { type: "tag", id: tagId });
    }
  }
  // Pin the seeded notebook + tag as sidebar shortcuts (db.shortcuts) so the
  // Shortcuts section + the ★ pin toggles have data on `npm run dev`. A
  // shortcut's id = its itemId; upstream allows notebook/topic/tag (not notes).
  if (nbId) await db.shortcuts.add({ itemId: nbId, itemType: "notebook" });
  if (tagId) await db.shortcuts.add({ itemId: tagId, itemType: "tag" });
  // Phase 2.4 demo — a checklist (task-list + task-item node-views) and an
  // attachment chip (attachment node-view), so `npm run dev` shows the
  // ported node-views immediately. The attachment uses a fake hash (the real
  // blob arrives with attachments auth in Phase 6); the chip still renders
  // from the stored attrs.
  await db.notes.add({
    title: "Phase 2.4 editor node-views",
    content: {
      type: "tiptap",
      data: '<p>Ported node-views from @notesnook/editor to Vue:</p><ul class="checklist" data-title="2.4a progress"><li class="checklist--item checked"><p>Attachment chip (inline atom)</p></li><li class="checklist--item checked"><p>Task item + task list (editable content + stats)</p></li><li class="checklist--item checked"><p>Embed (iframe + resizer + sandbox)</p></li><li class="checklist--item"><p>Round-trip contract test</p></li><li class="checklist--item"><p>Runtime check in the app</p></li></ul><p>Attachment sample: <span data-hash="demo-attachment-001" data-filename="phase-2.4.md" data-mime="text/markdown" data-size="2048"></span></p>'
    }
  });
  // Phase 2.4b demo — an embed node (sandboxed iframe) sized via the resizer,
  // so `npm run dev` shows the ported embed node-view immediately. Uses a
  // YouTube embed so it renders without auth; the resizer handle appears when
  // the node is selected.
  await db.notes.add({
    title: "Phase 2.4b embed node-view",
    content: {
      type: "tiptap",
      data: '<p>An embed node renders a sandboxed iframe and can be resized from its bottom-right corner (select it first):</p><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="480" height="270"></iframe><p>Alignment + the in-node toolbar arrive with the editor toolbar (Phase 2.5); the <code>align</code> attribute already round-trips.</p>'
    }
  });
  // Phase 2.4c demo — a code block with refractor syntax highlighting. The
  // grammar lazy-loads on first render (markdown here). The toolbar shows
  // caret position, indent-mode toggle, language selector, and copy.
  await db.notes.add({
    title: "Phase 2.4c code-block node-view",
    content: {
      type: "tiptap",
      data: '<p>A code block with refractor syntax highlighting (grammar lazy-loads on first render):</p><pre class="language-typescript" data-indent-type="space" data-indent-length="2"><code>function greet(name: string): string {\n  return `Hello, ${name}!`;\n}</code></pre><p>Type ``` or ~~~ followed by a language name to create one; the toolbar lets you switch language, toggle spaces/tabs, and copy.</p>'
    }
  });
  // Phase 2.4h demo — a table node-view. Drag-select cells, Tab/arrow-key
  // navigate, drag a column-resize handle (hover the right edge of the
  // selected column), and use the row/column "+" + "⋯" toolbars for
  // insert/delete/move/toggle-header/merge/split/color/border. The first column
  // carries data-colwidth so resizing is exercised on load.
  await db.notes.add({
    title: "Phase 2.4h table node-view",
    content: {
      type: "tiptap",
      data: '<p>A table node renders editable cells with column-resize handles and row/column toolbars:</p><table><tbody><tr><th>Feature</th><th>Status</th></tr><tr><td>Cell editing</td><td>works</td></tr><tr><td>Tab navigation</td><td>works</td></tr><tr><td>Column resize</td><td>drag the handle</td></tr><tr><td>Row/column toolbars</td><td>⋯ for properties</td></tr></tbody></table><p>Select a cell to reveal the toolbars; the column toolbar sits above the active cell, the row toolbar to its left.</p>'
    }
  });
  // Phase 2.4e demo — an image node-view. The seed uses an inline SVG data URL
  // (allowBase64) so it renders immediately without the Phase-6 attachments
  // auth / blob path. Select it to reveal the bottom-right resize handle
  // (aspect-ratio locked) and the drag handle. `data-align` + width/height +
  // data-aspect-ratio round-trip byte-for-byte; the in-node align/properties
  // toolbar arrives with the editor toolbar (Phase 2.5).
  await db.notes.add({
    title: "Phase 2.4e image node-view",
    content: {
      type: "tiptap",
      data: '<p>An image node renders a lazily-loaded, resizable image (select it to drag-resize from the bottom-right corner):</p><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNDAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMjQwIiBoZWlnaHQ9IjEyMCIgcng9IjEwIiBmaWxsPSIjNGY0NmU1Ii8+PHRleHQgeD0iMTIwIiB5PSI2OCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj4yLjRlIGltYWdlIG5vZGU8L3RleHQ+PC9zdmc+" width="240" height="120" data-align="center" data-aspect-ratio="2"><p>Attachment-backed images (a <code>hash</code> with no inline <code>src</code>) lazy-load their blob via the Phase-6 attachments bridge; until then a placeholder is shown.</p>'
    }
  });
  // Reminders demo — one "once" reminder a few days out, so `npm run dev`
  // exercises `db.reminders.add` and the headless reminders store has data for
  // the future RemindersView (on-site). Accounts stay empty — sync fills them.
  await db.reminders.add({
    title: "Try the Reminders view",
    description: "Seed reminder — the RemindersView lands on-site.",
    date: Date.now() + 3 * 24 * 60 * 60 * 1000,
    mode: "once",
    priority: "vibrate"
  });
  // Colors demo — one custom color beyond the `DefaultColors` palette, so
  // `npm run dev` exercises `db.colors.add` and the headless colors store has
  // data for the future sidebar "colors" section + note-color picker (on-site).
  // Accounts stay empty — sync fills them.
  await db.colors.add({ title: "Indigo", colorCode: "#5C6BC0" });
  // Mark seeded LAST so the flag is only set after a complete, successful seed.
  // If any add above throws, the flag stays unset and the next launch retries.
  await markSeeded(db);
}

/** Returns the initialised Database singleton. Throws if bootstrap hasn't run. */
export function getDatabase(): Database {
  if (!database) throw new Error("Database not initialised — call bootstrap() first");
  return database;
}