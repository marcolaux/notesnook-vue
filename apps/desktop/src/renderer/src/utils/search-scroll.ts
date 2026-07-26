/**
 * Scroll a TipTap editor to a search match — the renderer-side counterpart to
 * the pure snippet helpers in `@contracts/search`. Used by `Editor.vue` after
 * it consumes a pending scroll target staged by the global search store.
 *
 * Reuses the existing find-replace machinery: `findMatches` (the pure matcher
 * from editor-vue, already contract-tested in `find-replace.spec.ts`) resolves
 * `{from, to}` doc coordinates, `editor.commands.setFind` installs the
 * `find-match` highlight decorations, and `TextSelection.create` selects the
 * match. The actual VIEWPORT scroll is done manually (see `scrollToPos`), NOT
 * via `tr.scrollIntoView()`: ProseMirror's `scrollIntoView` scrolls
 * `view.scrollDOM` (the `.ProseMirror` node), but in this app the `.ProseMirror`
 * node has no overflow — the real scroller is its ancestor
 * `<div class="overflow-y-auto">` in `Editor.vue`. So `scrollIntoView` scrolls a
 * non-scrollable node and nothing visibly moves. `scrollToPos` walks up from
 * `editor.view.dom` to find the first scrollable ancestor and sets its
 * `scrollTop` to center the match.
 *
 * `matchIndex` is an approximation: the FTS result returns a few snippet blocks
 * (windows around matches), not every occurrence, so the Nth snippet is not
 * guaranteed to be the Nth occurrence in the doc. We clamp to the last available
 * match and scroll there.
 *
 * IMAGE / ASYNC-MEDIA LAYOUT SHIFT: the search result opens a fresh editor tab,
 * so this runs right after `setContent`. Notes with images render the image
 * node-views as 0×0 placeholders first (blobs download + `<img load>` fires
 * asynchronously), so the document is SHORT at scroll time — a match near the
 * end of the doc maps to a DOM spot near the top, and the scroll lands there.
 * Then the images load, the layout expands, and the match slides down. A
 * single `requestAnimationFrame` fires before the images load.
 *
 * FIX: re-scroll over a short window (raf + a few increasing timeouts covering
 * the image-load window) so a later attempt — after the images have expanded
 * the layout — maps the same stable doc position to its real (lower) DOM spot
 * and lands on the match. Each retry first checks the caret is still on the
 * match; if the user moved it (clicked/typed), the retries stop so we never
 * yank them back while they're reading. The doc position `from`/`to` is stable
 * across image loads (it's the ProseMirror model position; images are nodes at
 * fixed positions) — only the DOM mapping changes, which is exactly what the
 * re-scroll corrects.
 */
import type { Editor } from "@tiptap/vue-3";
import { TextSelection } from "@tiptap/pm/state";
import { findMatches, scrollPosIntoView, type SearchOptions } from "@notesnook-vue/editor-vue";

function scrollToPos(editor: Editor, pos: number): boolean {
  return scrollPosIntoView(editor.view, pos);
}

export function scrollEditorToMatch(
  editor: Editor,
  query: string,
  matchIndex = 0,
  opts?: SearchOptions
): void {
  const options: SearchOptions = { caseSensitive: false, regexp: false, ...opts };
  if (!query) return;
  // Install the find-match highlight decorations immediately (synchronous).
  try {
    editor.commands.setFind(query, options);
  } catch {
    // FindReplace extension not registered — skip highlight, still scroll.
  }
  const matches = findMatches(editor.state.doc, query, options);
  const m = matches[matchIndex] ?? matches[matches.length - 1] ?? matches[0];
  // eslint-disable-next-line no-console
  console.log(
    "[search-scroll] matches",
    matches.length,
    "query=",
    JSON.stringify(query),
    "idx=",
    matchIndex,
    "from=",
    m?.from,
    "to=",
    m?.to,
    "docSize=",
    editor.state.doc.content.size
  );
  if (!m) return;
  const from = m.from;
  const to = m.to;

  const doScroll = (log: boolean): void => {
    if (editor.isDestroyed) return;
    const doc = editor.state.doc;
    if (from >= doc.content.size) return;
    // Select the match (drives the find-match highlight + caret placement).
    const tr = editor.state.tr;
    tr.setSelection(
      TextSelection.create(doc, Math.min(from, doc.content.size - 1), Math.min(to, doc.content.size))
    );
    editor.view.dispatch(tr);
    // Manually scroll the real (ancestor) scroll container to center the match.
    const scrolled = scrollToPos(editor, from);
    if (log) {
      // eslint-disable-next-line no-console
      console.log("[search-scroll] dispatched scroll-to", from, to, "scrolled=", scrolled);
    }
  };

  // Only keep re-scrolling while the caret is still on the match — if the user
  // clicked/typed (moved the selection), stop so we don't yank them back.
  const stillOnMatch = (): boolean => {
    if (editor.isDestroyed) return false;
    const doc = editor.state.doc;
    const target = from < doc.content.size ? from : doc.content.size - 1;
    return editor.state.selection.from === target;
  };

  // First scroll on a raf (after the initial layout), then re-scroll on a few
  // increasing timeouts that cover the image-load window. Later attempts see
  // the post-image layout and land on the match's real position.
  requestAnimationFrame(() => {
    doScroll(true);
    const delays = [60, 180, 380, 700, 1200];
    for (const d of delays) {
      setTimeout(() => {
        if (stillOnMatch()) doScroll(false);
      }, d);
    }
  });
}