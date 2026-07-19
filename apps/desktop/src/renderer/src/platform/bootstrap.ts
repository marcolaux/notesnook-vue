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
import { readServerConfig, resolveHosts } from "./server-config";

let database: Database | undefined;

export async function bootstrap(): Promise<Database> {
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
  // `db.host()` must run before `db.init()`.
  try {
    const serverHosts = resolveHosts(readServerConfig());
    const platform = await createDesktopPlatform();
    const db = await initDatabase(platform, serverHosts);
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
  // Phase 3.2 demo — a notebook + a tag so the sidebar's Notebooks/Tags
  // sections show real collections. Group the two welcome notes under the
  // notebook; the tag is listed in the Tags section (note-filtering by
  // collection is the next increment).
  const nbId = await db.notebooks.add({ title: "Getting started" });
  const welcomeNotes = (await db.notes.all.items()).slice(0, 2).map((n) => n.id);
  if (nbId) await db.notes.addToNotebook(nbId, ...welcomeNotes);
  await db.tags.add({ title: "phase-3" });
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
}

/** Returns the initialised Database singleton. Throws if bootstrap hasn't run. */
export function getDatabase(): Database {
  if (!database) throw new Error("Database not initialised — call bootstrap() first");
  return database;
}