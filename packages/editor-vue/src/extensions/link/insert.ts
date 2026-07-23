/**
 * Shared note-link insertion helpers (pure). One source of truth used by BOTH
 * the inline `@`/`[[` `NoteSuggest` command AND the toolbar "Link to note"
 * button, so the inserted markup is identical regardless of trigger:
 *
 *   <a href="nn://note/<id>[?blockId=<id>]">Title</a>␣
 *
 * Selection-aware:
 *  - Non-empty selection → `setLink` over the selection (the visible text is
 *    kept; the mark's `title` attribute caches the selected text, mirroring
 *    upstream's `selectedText || link.title`).
 *  - Empty selection → insert the note's title as a text node carrying the
 *    `link` mark, followed by a trailing space text node.
 *
 * The trailing space MUST be `{ type: "text", text: " " }` (NOT a bare `" "`) —
 * `insertContentAt` routes a bare string through `Node.fromJSON` and the mixed
 * array insert silently no-ops. Same load-bearing footgun as the tag-mention
 * insert (`tag-suggest.ts`).
 */
import type { Editor } from "@tiptap/vue-3";

/** The `link` mark attributes every inserted note-link carries. */
export function linkMarkAttrs(href: string): Record<string, unknown> {
  return {
    href,
    target: "_blank",
    rel: "noopener noreferrer nofollow",
    spellcheck: "false"
  };
}

export interface NoteLinkPayload {
  href: string;
  title: string;
}

/**
 * Insert a note link at the current selection. When the selection is non-empty
 * the existing text becomes the link; otherwise the note's title is inserted as
 * the link text followed by a trailing space.
 */
export function insertNoteLink(editor: Editor, link: NoteLinkPayload): void {
  const { from, to, empty } = editor.state.selection;

  if (!empty) {
    const selectedText = editor.state.doc.textBetween(from, to, " ") || link.title;
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setMark("link", { ...linkMarkAttrs(link.href), title: selectedText })
      .run();
    return;
  }

  editor
    .chain()
    .focus()
    .insertContentAt(from, [
      { type: "text", text: link.title, marks: [{ type: "link", attrs: linkMarkAttrs(link.href) }] },
      { type: "text", text: " " }
    ])
    .run();
}

/**
 * Apply a note link to an existing selection (no text insertion). Used by the
 * toolbar button when the user has highlighted text to convert into a link.
 */
export function setNoteLink(editor: Editor, link: NoteLinkPayload): void {
  const { from, to } = editor.state.selection;
  const selectedText = editor.state.doc.textBetween(from, to, " ") || link.title;
  editor
    .chain()
    .focus()
    .extendMarkRange("link")
    .setMark("link", { ...linkMarkAttrs(link.href), title: selectedText })
    .run();
}