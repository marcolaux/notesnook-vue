/*
Deep-link paste bridge — when the user pastes a raw `nn://note/<id>[?blockId=<id>]`
URL (e.g. produced by "Copy deep link to block" via `navigator.clipboard.writeText`,
which sets ONLY `text/plain`), turn it into a proper inline note link instead of
literal URL text.

ProseMirror's default paste treats a plain-text URL as a string, so without this
the pasted deep link renders as `nn://note/abc?p1` text — not a link. We intercept
the paste in the editor's single `handlePaste` (see `attachments-bridge.ts`), and
reuse the SAME selection-aware insertion helper the `@`-`[[` NoteLinkPicker uses
(`insertNoteLink` from `@notesnook-vue/editor-vue`):

  - No selection → insert the target note's TITLE as a text node carrying the
    `link` mark + a trailing space (`<a href="nn://…">Note Title</a>␣`).
  - Text selected → link the selected text to the deep link (visible text kept).

Because `insertNoteLink` writes a real `link` mark with an `nn://` href, the
existing `note-link-bridge.ts` transaction listener auto-syncs the `note→note`
relation + the per-pane footer/backlink chip — no extra wiring needed here.

The gate is narrow on purpose: only a paste whose ENTIRE plain text is a single
`nn://note/<id>` token (no internal whitespace) is intercepted, so a paragraph
that merely *contains* a URL is left to the default paste, and notebook/monograph
`nn://` links (which no editor copy-feature produces) are ignored. A pasted
rendered `<a href="nn://…">` (text/html) is also untouched — PM's default paste
already preserves it; this bridge only rewrites the plain-text-URL case.
*/
import type { Editor } from "@tiptap/vue-3";
import { noteIdFromLink, insertNoteLink } from "@notesnook-vue/editor-vue";
import { getDatabase } from "@/platform/bootstrap";

/**
 * True iff `text` is a single `nn://note/<id>[?blockId=<id>]` token — trimmed,
 * no internal whitespace, and `noteIdFromLink` resolves a non-null note id. The
 * "whole string + no whitespace" gate is what keeps a pasted paragraph that
 * merely contains a URL (and notebook/monograph links) out of the rewrite path.
 */
export function isDeepLinkPasteText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  return noteIdFromLink(trimmed) !== null;
}

/**
 * Resolve the visible title for a deep-linked note, falling back to `"Untitled"`
 * when the note is missing/locked/trashed/deleted (mirrors the picker's
 * `n.title || "Untitled"`). Never throws into the editor.
 */
async function resolveNoteTitle(id: string): Promise<string> {
  try {
    const note = await getDatabase().notes.note(id);
    return note?.title?.trim() || "Untitled";
  } catch {
    return "Untitled";
  }
}

/**
 * Resolve the title (only when there's no selection — pasting OVER a selection
 * needs no title, since `insertNoteLink` keeps the selected text) and insert the
 * note link. `empty` is read BEFORE the await so a selection-paste skips the db
 * lookup entirely. Guards `editor.isDestroyed` after the await — a note switch
 * mid-lookup must not insert into a stale editor (same guard as
 * `insertIngestedAt`). `href` is the original pasted URL so the `blockId` query
 * is preserved byte-for-byte.
 */
async function insertDeepLink(
  editor: Editor,
  href: string,
  id: string
): Promise<void> {
  const { empty } = editor.state.selection;
  const title = empty ? await resolveNoteTitle(id) : "";
  if (editor.isDestroyed) return;
  insertNoteLink(editor, { href, title });
}

/**
 * Inspect a paste event's plain text; if it is a single `nn://note/<id>` deep
 * link, suppress the default paste and insert a titled note link asynchronously.
 * Returns `true` synchronously (handled → caller stops propagation) when the
 * paste is a deep link, `false` otherwise (caller falls through to ProseMirror's
 * default text/HTML paste). Mirrors the attachments bridge's "return true
 * synchronously, run async after" pattern.
 */
export function handleDeepLinkPaste(editor: Editor, event: ClipboardEvent): boolean {
  const text = (event.clipboardData?.getData("text/plain") ?? "").trim();
  if (!isDeepLinkPasteText(text)) return false;
  const id = noteIdFromLink(text);
  if (!id) return false;
  event.preventDefault();
  void insertDeepLink(editor, text, id);
  return true;
}