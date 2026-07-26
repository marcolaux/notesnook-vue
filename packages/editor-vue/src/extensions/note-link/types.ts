/**
 * Note-linking (`@` / `[[`) types. `NoteSuggest` is the `@tiptap/suggestion`
 * extension that opens {@link NoteLinkPicker} at the cursor; the picker drills
 * into a note's content blocks (upstream `?blockId=` section links).
 *
 * The `link` MARK (not a node) is the source of truth — see `../link/link.ts`.
 * These types describe the picker's data, not the persisted mark.
 */

/** One row in the note-search results. */
export interface NoteSuggestionItem {
  id: string;
  title: string;
  /** Optional highlighted snippet (FTS `Match[]` → `<mark>` HTML). */
  snippetHtml?: string;
}

/**
 * A content block of a note, returned by the host's `getContentBlocks(noteId)`
 * (which wraps `db.notes.contentBlocks`). Mirrors upstream's `ContentBlock`:
 * `id` is the block id folded into `?blockId=`; `content` is the block's text
 * (ellipsized for display); `type` is the block type (`h1`..`h6`, `p`, …).
 */
export interface ContentBlockItem {
  id: string;
  type: string;
  content: string;
}

/** The result handed to the insert command — an `nn://note/<id>[?blockId=]` href + display title. */
export interface NoteLinkResult {
  href: string;
  title: string;
}

export interface NoteLinkLabels {
  searchPlaceholder: string;
  blockSearchPlaceholder: string;
  linkWholeNote: string;
  backToNotes: string;
  noResults: string;
  noBlocks: string;
  emptyBlock: string;
  createNote: string;
  notesTab: string;
  webTab: string;
  fileTab: string;
  webPlaceholder: string;
  filePlaceholder: string;
  displayTitlePlaceholder: string;
  browseFile: string;
  insertLink: string;
  webLinkOption: string;
  fileLinkOption: string;
}

export const DEFAULT_NOTE_LINK_LABELS: NoteLinkLabels = {
  searchPlaceholder: "Search notes…",
  blockSearchPlaceholder: "Search section…",
  linkWholeNote: "Link to whole note",
  backToNotes: "Back to notes",
  noResults: "No notes found",
  noBlocks: "No sections in this note",
  emptyBlock: "(empty)",
  createNote: "Create note",
  notesTab: "Notes",
  webTab: "Web URL",
  fileTab: "Local File",
  webPlaceholder: "https://example.com",
  filePlaceholder: "file:///path/to/file",
  displayTitlePlaceholder: "Display text (optional)",
  browseFile: "Browse file…",
  insertLink: "Insert Link",
  webLinkOption: "Link to web page",
  fileLinkOption: "Link to local file"
};

export interface NoteSuggestOptions {
  /** Maximum note results shown before the popup scrolls. */
  maxItems?: number;
}