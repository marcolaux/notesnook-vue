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
 * (fontSize/math/textDirection/indent/outdent/link-prompt/internal-link) are
 * registered when those extensions land.
 *
 * Phase 5.5 toolbar: every action now carries enough metadata for the toolbar
 * to render it without re-implementing per-action logic:
 *  - `glyph` — compact toolbar label (fallback: title).
 *  - `kind` — `"toggle"` (a button), `"dropdown"` (button → opens a menu via
 *    `menu(editor)`), `"color"` (button → renderer builds a colour submenu;
 *    `colorTarget` selects text vs highlight), `"conditional"` (button shown
 *    only when `available(editor)`).
 *  - `isActive`/`isDisabled` — per-action active/disabled state (moved out of
 *    the old flat `EditorToolbar.vue` switch so the toolbar stays generic).
 *  - `menu` — for dropdown/conditional kinds, a pure builder that returns the
 *    `ToolbarMenuItem[]` the renderer maps to its context-menu `MenuItem`s.
 *    Pure = only editor commands, no host UI (host UI like the colour picker is
 *    a renderer concern, handled by `kind:"color"` in the renderer).
 *
 * The 2D `DEFAULT_TOOLBAR` preset mirrors upstream's group structure: groups
 * are arrays of items, and a **nested array inside a group** is the "more"
 * split-button (its actions render in a dropdown popup). Persisted/overridden
 * by the renderer's toolbar store (`db.settings.setToolbarConfig`); this is
 * only the default.
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
  "subscript",
  "superscript",
  "textColor",
  "fontFamily",
  "alignment",
  "bulletList",
  "numberedList",
  "checkList",
  "headings",
  "clearformatting",
  "tableSettings",
  "imageSettings",
  "embedSettings"
  // History (undo/redo) is not a separate upstream ToolId — registered as our
  // own `editor:undo`/`editor:redo` commands without a parity entry.
];

/**
 * A menu item the toolbar can render. A structural mirror of the renderer's
 * context-menu `MenuItem` (see `apps/desktop/src/renderer/src/utils/
 * context-menu.ts`) — editor-vue MUST NOT import the renderer module, so the
 * shape is duplicated here and the renderer casts `ToolbarMenuItem` →
 * `MenuItem` at render (the fields are identical). Keep this in sync with that
 * interface; a drift surfaces as a type error in the renderer's mapper.
 */
export interface ToolbarMenuSubmenu {
  search?: { placeholder: string };
  build: (query: string) => ToolbarMenuItem[];
}
export interface ToolbarMenuItem {
  id: string;
  label: string;
  separator?: boolean;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  /** Leading CSS colour-swatch dot (rendered in the check column). */
  color?: string;
  /** Leading icon — a name in the ui-vue icon registry (renderer renders an
   *  `<Icon>` before the label). */
  icon?: string;
  submenu?: ToolbarMenuSubmenu;
  keepOpen?: boolean;
  onSelect?: () => void | Promise<void>;
}

/** How the toolbar renders an action. */
export type EditorActionKind = "toggle" | "dropdown" | "color" | "conditional";

export interface EditorAction {
  /** Stable id (registry command id is `editor:<id>`; slash item id is `<id>`). */
  id: string;
  title: string;
  keywords?: string[];
  /** Shown in the slash `/`-menu. Inline marks / history are palette-only. */
  slash?: boolean;
  /** Toolbar render shape (default `"toggle"`). */
  kind?: EditorActionKind;
  /** Compact toolbar icon — a name in the ui-vue icon registry (fallback:
   *  the title is shown as text when unset). */
  glyph?: string;
  /** Active (pressed) state for the toolbar button. Default `false`. */
  isActive?: (editor: Editor) => boolean;
  /** Disabled state for the toolbar button. Default `!editor.isEditable`. */
  isDisabled?: (editor: Editor) => boolean;
  /**
   * For `"dropdown"` / `"conditional"` kinds: build the menu items (pure —
   * only editor commands). Rebuilt on each open so active states are fresh.
   * Ignored for `"toggle"` / `"color"`.
   */
  menu?: (editor: Editor) => ToolbarMenuItem[];
  /** For `"conditional"`: the button renders only when this returns true. */
  available?: (editor: Editor) => boolean;
  /** For `"color"`: which mark the colour applies to. */
  colorTarget?: "text" | "highlight";
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

/** Font families offered by the Font Family dropdown. */
const FONT_FAMILIES: { label: string; value: string | null }[] = [
  { label: "Default", value: null },
  { label: "Sans", value: "sans-serif" },
  { label: "Serif", value: "serif" },
  { label: "Mono", value: "monospace" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Verdana", value: "Verdana, sans-serif" }
];

const ALIGNMENTS: { label: string; value: "left" | "center" | "right" | "justify"; glyph: string }[] = [
  { label: "Align left", value: "left", glyph: "align-left" },
  { label: "Align center", value: "center", glyph: "align-center" },
  { label: "Align right", value: "right", glyph: "align-right" },
  { label: "Justify", value: "justify", glyph: "align-justify" }
];

/** A separator inline (kept here so `menu` builders read tidily). */
function sep(id: string): ToolbarMenuItem {
  return { id, label: "", separator: true };
}

/**
 * The MVP editor-action set. Marks + history are palette-only (`slash` false);
 * block inserts/toggles are also slash-menu items (`slash` true).
 */
export const EDITOR_ACTIONS: EditorAction[] = [
  // --- Inline marks (palette only; toolbar toggles) ---
  {
    id: "bold",
    title: "Bold",
    keywords: ["strong"],
    glyph: "bold",
    isActive: (e) => e.isActive("bold"),
    run: (e) => chain(e).toggleBold().run()
  },
  {
    id: "italic",
    title: "Italic",
    keywords: ["emphasize"],
    glyph: "italic",
    isActive: (e) => e.isActive("italic"),
    run: (e) => chain(e).toggleItalic().run()
  },
  {
    id: "underline",
    title: "Underline",
    keywords: ["u"],
    glyph: "underline",
    isActive: (e) => e.isActive("underline"),
    run: (e) => chain(e).toggleUnderline().run()
  },
  {
    id: "strikethrough",
    title: "Strikethrough",
    keywords: ["strike"],
    glyph: "strikethrough",
    isActive: (e) => e.isActive("strike"),
    run: (e) => chain(e).toggleStrike().run()
  },
  {
    id: "code",
    title: "Inline code",
    keywords: ["mono"],
    glyph: "code",
    isActive: (e) => e.isActive("code"),
    isDisabled: (e) => e.isActive("codeblock"),
    run: (e) => chain(e).toggleCode().run()
  },
  {
    id: "subscript",
    title: "Subscript",
    keywords: ["sub"],
    glyph: "subscript",
    isActive: (e) => e.isActive("subscript"),
    isDisabled: (e) => e.isActive("codeblock"),
    run: (e) => chain(e).toggleSubscript().run()
  },
  {
    id: "superscript",
    title: "Superscript",
    keywords: ["sup"],
    glyph: "superscript",
    isActive: (e) => e.isActive("superscript"),
    isDisabled: (e) => e.isActive("codeblock"),
    run: (e) => chain(e).toggleSuperscript().run()
  },
  {
    id: "highlight",
    title: "Highlight",
    keywords: ["marker", "highlighter"],
    glyph: "highlighter",
    kind: "color",
    colorTarget: "highlight",
    isActive: (e) => e.isActive("highlight"),
    // Palette/slash entry: toggle the default highlight colour.
    run: (e) => chain(e).toggleHighlight().run()
  },
  {
    id: "textColor",
    title: "Text color",
    keywords: ["colour", "color", "foreground"],
    glyph: "type",
    kind: "color",
    colorTarget: "text",
    isActive: (e) => !!e.getAttributes("textStyle").color,
    // Palette entry: open the host colour picker (renderer wires the hook).
    run: (e) => {
      (e.storage as { openEditorColorPicker?: (t: "text" | "highlight") => void }).openEditorColorPicker?.("text");
    }
  },
  {
    id: "clearFormatting",
    title: "Clear formatting",
    keywords: ["reset", "formatClear"],
    glyph: "remove-formatting",
    run: (e) => {
      // `unsetMark("link")` is a no-op if the link mark isn't registered yet.
      const c = chain(e).unsetAllMarks();
      if (typeof c.unsetMark === "function") c.unsetMark("link");
      c.run();
    }
  },
  { id: "undo", title: "Undo", glyph: "undo-2", isDisabled: (e) => !e.can().undo(), run: (e) => chain(e).undo().run() },
  { id: "redo", title: "Redo", glyph: "redo-2", isDisabled: (e) => !e.can().redo(), run: (e) => chain(e).redo().run() },

  // --- Headings (toolbar dropdown; palette/slash keep the 3 levels) ---
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
    id: "headings",
    title: "Heading",
    keywords: ["heading", "style", "level"],
    glyph: "heading",
    kind: "dropdown",
    isActive: (e) => e.isActive("heading"),
    isDisabled: (e) => e.isActive("codeblock"),
    menu: (e) => {
      const items: ToolbarMenuItem[] = [
        {
          id: "paragraph",
          label: "Text",
          checked: e.isActive("paragraph"),
          onSelect: () => chain(e).setParagraph().run()
        }
      ];
      for (let level = 1; level <= 6; level++) {
        items.push({
          id: `heading-${level}`,
          label: `Heading ${level}`,
          checked: e.isActive("heading", { level }),
          onSelect: () => chain(e).setHeading({ level }).run()
        });
      }
      return items;
    },
    run: () => {
      /* dropdown — opens via the toolbar */
    }
  },
  {
    id: "paragraph",
    title: "Text",
    keywords: ["paragraph", "plain", "normal"],
    slash: true,
    run: (e) => chain(e).setParagraph().run()
  },
  {
    id: "fontFamily",
    title: "Font family",
    keywords: ["font", "typeface"],
    glyph: "case-sensitive",
    kind: "dropdown",
    isActive: (e) => !!e.getAttributes("textStyle").fontFamily,
    menu: (e) => {
      const current = (e.getAttributes("textStyle").fontFamily as string | null) ?? null;
      return FONT_FAMILIES.map((f) => ({
        id: `font-${f.label}`,
        label: f.label,
        checked: (f.value ?? null) === (current ?? null) && (f.value === null ? current === null : true),
        onSelect: () => {
          if (f.value === null) chain(e).unsetFontFamily().run();
          else chain(e).setFontFamily(f.value).run();
        }
      }));
    },
    run: () => {
      /* dropdown */
    }
  },
  {
    id: "alignment",
    title: "Alignment",
    keywords: ["align", "justify", "text-align"],
    glyph: "align-left",
    kind: "dropdown",
    isActive: (e) => e.isActive({ textAlign: "center" }) || e.isActive({ textAlign: "right" }) || e.isActive({ textAlign: "justify" }),
    menu: (e) =>
      ALIGNMENTS.map((a) => ({
        id: `align-${a.value}`,
        label: a.label,
        icon: a.glyph,
        checked: e.isActive({ textAlign: a.value }),
        onSelect: () => chain(e).setTextAlign(a.value).run()
      })),
    run: () => {
      /* dropdown */
    }
  },

  // --- Lists (palette + slash; toolbar toggles) ---
  {
    id: "bulletList",
    title: "Bullet list",
    keywords: ["unordered", "list", "ul"],
    slash: true,
    glyph: "list",
    isActive: (e) => e.isActive("bulletList"),
    run: (e) => chain(e).toggleBulletList().run()
  },
  {
    id: "numberedList",
    title: "Numbered list",
    keywords: ["ordered", "list", "ol"],
    slash: true,
    glyph: "list-ordered",
    isActive: (e) => e.isActive("orderedList"),
    run: (e) => chain(e).toggleOrderedList().run()
  },
  {
    id: "checkList",
    title: "Task list",
    keywords: ["checklist", "todo", "task", "check"],
    slash: true,
    glyph: "list-checks",
    isActive: (e) => e.isActive("taskList"),
    run: (e) => chain(e).toggleTaskList().run()
  },
  {
    id: "codeBlock",
    title: "Code block",
    keywords: ["pre", "code", "snippet"],
    slash: true,
    glyph: "file-code-2",
    isActive: (e) => e.isActive("codeblock"),
    run: (e) => chain(e).toggleCodeBlock().run()
  },
  {
    id: "blockquote",
    title: "Blockquote",
    keywords: ["quote", "blockquote"],
    slash: true,
    glyph: "quote",
    isActive: (e) => e.isActive("blockquote"),
    run: (e) => chain(e).toggleBlockquote().run()
  },
  {
    id: "horizontalRule",
    title: "Horizontal rule",
    keywords: ["hr", "divider", "separator", "line"],
    slash: true,
    glyph: "minus",
    run: (e) => chain(e).setHorizontalRule().run()
  },
  {
    id: "image",
    title: "Image",
    keywords: ["picture", "photo", "img"],
    slash: true,
    glyph: "image",
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
    glyph: "table-2",
    run: (e) => chain(e).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  },
  {
    id: "embed",
    title: "Embed",
    keywords: ["iframe", "youtube", "video", "web"],
    slash: true,
    glyph: "film",
    run: (e) => chain(e).insertEmbed().run()
  },

  // --- Conditional (contextual) settings — shown only when the selection is
  // inside the relevant node. The table node already has its own floating
  // row/column toolbars; this is a minimal main-toolbar entry pointing at the
  // common table commands. Image/embed have no in-node toolbar yet, so this
  // is the only UI for their align/size/remove actions.
  {
    id: "tableSettings",
    title: "Table",
    glyph: "table-2",
    kind: "conditional",
    available: (e) => e.isActive("table"),
    menu: (e) => [
      { id: "tbl-insert-row", label: "Insert row below", onSelect: () => chain(e).addRowAfter().run() },
      { id: "tbl-insert-col", label: "Insert column right", onSelect: () => chain(e).addColumnAfter().run() },
      sep("tbl-sep"),
      { id: "tbl-header-row", label: "Toggle header row", checked: e.isActive("tableHeader"), onSelect: () => chain(e).toggleHeaderRow().run() },
      { id: "tbl-header-col", label: "Toggle header column", checked: e.isActive("tableHeader"), onSelect: () => chain(e).toggleHeaderColumn().run() },
      sep("tbl-sep2"),
      { id: "tbl-delete", label: "Delete table", danger: true, onSelect: () => chain(e).deleteTable().run() }
    ],
    run: () => {
      /* conditional dropdown */
    }
  },
  {
    id: "imageSettings",
    title: "Image",
    glyph: "image",
    kind: "conditional",
    available: (e) => e.isActive("image"),
    menu: (e) => {
      const align = (e.getAttributes("image").align as string | undefined) ?? "left";
      return [
        { id: "img-left", label: "Align left", checked: align === "left", onSelect: () => chain(e).updateAttributes("image", { align: "left" }).run() },
        { id: "img-center", label: "Align center", checked: align === "center", onSelect: () => chain(e).updateAttributes("image", { align: "center" }).run() },
        { id: "img-right", label: "Align right", checked: align === "right", onSelect: () => chain(e).updateAttributes("image", { align: "right" }).run() },
        sep("img-sep"),
        { id: "img-reset-size", label: "Reset size", onSelect: () => chain(e).setImageSize({ width: null, height: null }).run() },
        sep("img-sep2"),
        { id: "img-remove", label: "Remove image", danger: true, onSelect: () => e.chain().focus().deleteSelection().run() }
      ];
    },
    run: () => {
      /* conditional dropdown */
    }
  },
  {
    id: "embedSettings",
    title: "Embed",
    glyph: "film",
    kind: "conditional",
    available: (e) => e.isActive("embed"),
    menu: (e) => {
      const align = (e.getAttributes("embed").align as string | undefined) ?? "left";
      return [
        { id: "emb-left", label: "Align left", checked: align === "left", onSelect: () => chain(e).setEmbedAlignment({ align: "left" }).run() },
        { id: "emb-center", label: "Align center", checked: align === "center", onSelect: () => chain(e).setEmbedAlignment({ align: "center" }).run() },
        { id: "emb-right", label: "Align right", checked: align === "right", onSelect: () => chain(e).setEmbedAlignment({ align: "right" }).run() },
        sep("emb-sep"),
        { id: "emb-reset-size", label: "Reset size", onSelect: () => chain(e).setEmbedSize({ width: null, height: null }).run() },
        sep("emb-sep2"),
        { id: "emb-remove", label: "Remove embed", danger: true, onSelect: () => e.chain().focus().deleteSelection().run() }
      ];
    },
    run: () => {
      /* conditional dropdown */
    }
  }
];

/** Lookup by id (the toolbar resolves persisted config ids through this). */
export const EDITOR_ACTION_BY_ID: Map<string, EditorAction> = new Map(
  EDITOR_ACTIONS.map((a) => [a.id, a])
);

/**
 * The default toolbar layout (2D). Top-level arrays are groups (rendered with
 * separators); a nested array inside a group is the "more" split-button — its
 * actions render in a dropdown popup. Conditional tools render only when the
 * selection is inside the relevant node. Mirrors upstream's default preset
 * shape (minus link/math/text-direction/fontSize, not ported yet).
 */
export type ToolbarItem = string | string[];
export type ToolbarDefinition = ToolbarItem[][];
export const DEFAULT_TOOLBAR: ToolbarDefinition = [
  ["undo", "redo"],
  [
    "bold",
    "italic",
    "underline",
    [
      "strikethrough",
      "code",
      "subscript",
      "superscript",
      "highlight",
      "textColor",
      "clearFormatting"
    ]
  ],
  ["headings", "fontFamily"],
  ["checkList", "numberedList", "bulletList"],
  ["alignment"],
  ["tableSettings", "imageSettings", "embedSettings"]
];

/** Slash-menu items (the `slash: true` subset of {@link EDITOR_ACTIONS}). */
export const SLASH_ITEMS: EditorAction[] = EDITOR_ACTIONS.filter((a) => a.slash);

export type SlashItem = EditorAction;

/** Filter slash items by a query (subsequence match on title + keywords). */
export function filterSlashItems(items: readonly SlashItem[], query: string): SlashItem[] {
  return filterByKey(items, query, (a) => [a.title, ...(a.keywords ?? [])]);
}