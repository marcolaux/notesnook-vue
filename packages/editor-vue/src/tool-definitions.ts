/**
 * Editor-action metadata — the parity source for the command palette
 * (Phase 2.5) and the slash-command menu, vendored here so editor-vue owns
 * editor-action semantics (the renderer's editor-commands map consumes this
 * and never re-implements `editor.chain()` calls).
 *
 * Parity: upstream `@notesnook/editor`'s `tool-definitions.ts` enumerates every
 * editor action id via the `ToolId` union. We implement the **MVP subset**
 * (decision #6: ~18 extensions). `PARITY` is a compile-checked list of the
 * upstream `ToolId`s we cover — `import type { ToolId }` is erased at compile
 * time so React/theme-ui/zustand stay out of the renderer bundle (the same
 * 0-leck rule theme-vue uses for `@notesnook/theme`). Unported actions
 * (subscript/superscript/textColor/fontFamily/fontSize/math/textDirection/
 * indent/outdent/link-prompt) are registered when those extensions land.
 * Underline + highlight landed in Phase 5.3 (plain toggles, no picker).
 */
import type { Editor } from "@tiptap/vue-3";
import type { ToolId } from "@notesnook/editor";
import { filterByKey } from "./utils/filter";

/** Upstream ToolIds we implement in this MVP subset (compile-checked). */
export const PARITY: ToolId[] = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "code",
  "highlight",
  "bulletList",
  "numberedList",
  "checkList",
  "headings",
  "tableSettings",
  "imageSettings",
  "embedSettings"
  // History (undo/redo) is not a separate upstream ToolId — registered as our
  // own `editor:undo`/`editor:redo` commands without a parity entry.
];

export interface EditorAction {
  /** Stable id (registry command id is `editor:<id>`; slash item id is `<id>`). */
  id: string;
  title: string;
  keywords?: string[];
  /** Shown in the slash `/`-menu. Inline marks / history are palette-only. */
  slash?: boolean;
  /**
   * Execute the action against the editor. The chain is cast to `any` because
   * `ChainedCommands` is derived from the editor's loaded extensions
   * (Editor.vue's set), which this standalone module can't see; the commands
   * are verified at runtime by the editor's extension configuration.
   */
  run: (editor: Editor) => void;
}

// `editor.chain().focus()` returns a ChainedCommands whose available commands
// depend on the editor's loaded extensions. Cast to `any` so this module stays
// decoupled from a specific extension set (see EditorAction.run doc comment).
const chain = (editor: Editor): any => editor.chain().focus();

const toggleHeading = (level: 1 | 2 | 3) => (editor: Editor): void => {
  chain(editor).toggleHeading({ level }).run();
};

/**
 * The MVP editor-action set. Marks + history are palette-only (`slash` false);
 * block inserts/toggles are also slash-menu items (`slash` true).
 */
export const EDITOR_ACTIONS: EditorAction[] = [
  // --- Inline marks (palette only) ---
  { id: "bold", title: "Bold", keywords: ["strong"], run: (e) => chain(e).toggleBold().run() },
  { id: "italic", title: "Italic", keywords: ["emphasize"], run: (e) => chain(e).toggleItalic().run() },
  { id: "underline", title: "Underline", keywords: ["u"], run: (e) => chain(e).toggleUnderline().run() },
  { id: "strikethrough", title: "Strikethrough", keywords: ["strike"], run: (e) => chain(e).toggleStrike().run() },
  { id: "code", title: "Inline code", keywords: ["mono"], run: (e) => chain(e).toggleCode().run() },
  { id: "highlight", title: "Highlight", keywords: ["marker", "highlighter"], run: (e) => chain(e).toggleHighlight().run() },
  { id: "undo", title: "Undo", run: (e) => chain(e).undo().run() },
  { id: "redo", title: "Redo", run: (e) => chain(e).redo().run() },

  // --- Blocks (palette + slash) ---
  {
    id: "headings-1",
    title: "Heading 1",
    keywords: ["h1", "title", "heading"],
    slash: true,
    run: toggleHeading(1)
  },
  {
    id: "headings-2",
    title: "Heading 2",
    keywords: ["h2", "subtitle", "heading"],
    slash: true,
    run: toggleHeading(2)
  },
  {
    id: "headings-3",
    title: "Heading 3",
    keywords: ["h3", "heading"],
    slash: true,
    run: toggleHeading(3)
  },
  {
    id: "paragraph",
    title: "Text",
    keywords: ["paragraph", "plain", "normal"],
    slash: true,
    run: (e) => chain(e).setParagraph().run()
  },
  {
    id: "bulletList",
    title: "Bullet list",
    keywords: ["unordered", "list", "ul"],
    slash: true,
    run: (e) => chain(e).toggleBulletList().run()
  },
  {
    id: "numberedList",
    title: "Numbered list",
    keywords: ["ordered", "list", "ol"],
    slash: true,
    run: (e) => chain(e).toggleOrderedList().run()
  },
  {
    id: "checkList",
    title: "Task list",
    keywords: ["checklist", "todo", "task", "check"],
    slash: true,
    run: (e) => chain(e).toggleTaskList().run()
  },
  {
    id: "codeBlock",
    title: "Code block",
    keywords: ["pre", "code", "snippet"],
    slash: true,
    run: (e) => chain(e).toggleCodeBlock().run()
  },
  {
    id: "blockquote",
    title: "Blockquote",
    keywords: ["quote", "blockquote"],
    slash: true,
    run: (e) => chain(e).toggleBlockquote().run()
  },
  {
    id: "horizontalRule",
    title: "Horizontal rule",
    keywords: ["hr", "divider", "separator", "line"],
    slash: true,
    run: (e) => chain(e).setHorizontalRule().run()
  },
  {
    id: "image",
    title: "Image",
    keywords: ["picture", "photo", "img"],
    slash: true,
    // Open the host-provided attachment picker (renderer wires
    // `editor.storage.openAttachmentPicker` to a file input → ingest → insert).
    // Upstream's `addImage` does the same; the picker is a host concern. A
    // no-op until the storage hook is wired (so no regression in isolation).
    run: (e) => {
      (
        e.storage as { openAttachmentPicker?: (type: string) => void }
      ).openAttachmentPicker?.("image");
    }
  },
  {
    id: "table",
    title: "Table",
    keywords: ["grid", "cells", "rows", "columns"],
    slash: true,
    run: (e) => chain(e).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  },
  {
    id: "embed",
    title: "Embed",
    keywords: ["iframe", "youtube", "video", "web"],
    slash: true,
    run: (e) => chain(e).insertEmbed().run()
  }
];

/** Slash-menu items (the `slash: true` subset of {@link EDITOR_ACTIONS}). */
export const SLASH_ITEMS: EditorAction[] = EDITOR_ACTIONS.filter((a) => a.slash);

export type SlashItem = EditorAction;

/** Filter slash items by a query (subsequence match on title + keywords). */
export function filterSlashItems(items: readonly SlashItem[], query: string): SlashItem[] {
  return filterByKey(items, query, (a) => [a.title, ...(a.keywords ?? [])]);
}