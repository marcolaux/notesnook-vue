/**
 * Pure editor context-menu entry builder (headless) — turns a right-click
 * snapshot of the TipTap editor's state (selection / active marks / active
 * link / editability) + a small bag of action callbacks into the flat
 * `MenuItem[]` the {@link useContextMenuStore} overlay renders. Mirrors the
 * note/sidebar builders in `context-menu-entries.ts`: framework-agnostic (no
 * Pinia, no db, no TipTap import) so it is unit-tested in isolation (see
 * `tests/contract/editor-context-menu.spec.ts`); `Editor.vue`'s
 * `useEditorContextMenu` composable passes the real editor commands + bridges
 * as the deps.
 *
 * Labels resolve through `i18n.global.t` (the menu is rebuilt on each right-
 * click, so labels localise + track the active locale without reactive wiring).
 * `checked` mirrors the active mark on the current selection so formatting
 * toggles show a leading ✓; `disabled` greys out clipboard ops that need a
 * selection (Cut/Copy/Clear-formatting) or editability (Paste). The Link row
 * swaps to "Edit link…" + "Remove link" when a `link` mark is active on the
 * selection.
 *
 * The Insert + List groups are ONE-level submenus (`SubmenuSpec.build`, no
 * search) so the root menu stays compact; their leaves are plain actions.
 */
import { separator, type MenuItem, type SubmenuSpec } from "@/utils/context-menu";
import i18n from "@/i18n";

const t = i18n.global.t.bind(i18n.global);

/**
 * A hash-backed image or attachment node under the right-click — enough to open
 * it in a tab / window (`hash` is the durable link to the stored blob). Only
 * set when the clicked node is an `image` with a `hash` (a `src`-only inline
 * image has no attachment blob to preview) or an `attachment` chip. Structurally
 * identical to `AttachmentTabAttrs` in the editor-layout store; kept as a local
 * interface so this pure builder doesn't import the store.
 */
export interface MediaTarget {
  hash: string;
  filename: string;
  mime: string;
  size: number;
}

/**
 * The editor state snapshot the menu is built from, captured at right-click
 * time from `editor.state.selection` / `editor.isActive(...)` /
 * `editor.getAttributes("link")` / `editor.isEditable`.
 */
export interface EditorMenuTarget {
  /** A non-empty text selection is present (Cut/Copy/Clear-formatting enabled). */
  hasSelection: boolean;
  /** The editor is editable (Paste enabled; Cut acts on a live selection). */
  editable: boolean;
  /** Active inline marks on the current selection (drive the `checked` state). */
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  highlight: boolean;
  /** The active `link` mark on the selection, or `null` when none. */
  link: { href: string } | null;
  /** A hash-backed image / attachment node under the cursor, or `null`. When
   *  set, "Open in new tab" + "Open in new window" rows are prepended. */
  media: MediaTarget | null;
}

/**
 * The action callbacks the builder closes over. Each is a plain `() => void`
 * (the composable wires the real editor command / bridge / dialog); the builder
 * never touches the editor directly so it stays pure + testable.
 */
export interface EditorMenuDeps {
  // --- clipboard ---
  cut: () => void;
  copy: () => void;
  paste: () => void;
  /** Paste the clipboard's plain-text representation, discarding formatting. */
  pasteAsPlainText: () => void;
  // --- formatting toggles ---
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrike: () => void;
  toggleCode: () => void;
  toggleHighlight: () => void;
  clearFormatting: () => void;
  // --- links ---
  /** Open the URL link dialog in create mode (arbitrary URL). */
  openLinkDialog: () => void;
  /** Open the URL link dialog in edit mode, seeded with the active link. */
  editLink: () => void;
  /** Remove the active `link` mark from the selection. */
  removeLink: () => void;
  /** Insert `@` to trigger the NoteSuggest note-link picker. */
  linkToNote: () => void;
  // --- insert ---
  insertTodayDateLink: () => void;
  insertDate: () => void;
  insertImage: () => void;
  insertTable: () => void;
  insertHorizontalRule: () => void;
  insertCodeBlock: () => void;
  insertBlockquote: () => void;
  // --- lists ---
  toggleBulletList: () => void;
  toggleNumberedList: () => void;
  toggleCheckList: () => void;
  toggleSimpleCheckList: () => void;
  toggleOutlineList: () => void;
  // --- actions ---
  /** Copy an `nn://note/<id>?blockId=<id>` deep link to the block at the caret. */
  copyBlockLink: () => void;
  findInNote: () => void;
  replaceInNote: () => void;
  openCommandPalette: () => void;
  // --- media (image / attachment chip) ---
  /** Open the hash-backed image/attachment under the cursor as a new tab. */
  openMediaInNewTab: (attrs: MediaTarget) => void;
  /** Open the hash-backed image/attachment under the cursor in a new
   *  focus-mode window (a single-attachment pane window). */
  openMediaInNewWindow: (attrs: MediaTarget) => void;
}

/** Build the Insert ▸ submenu leaves. */
function buildInsertSubmenu(deps: EditorMenuDeps): SubmenuSpec {
  return {
    build: () => [
      { id: "ins-link-note", label: t("contextMenu.linkToNote"), icon: "link", onSelect: deps.linkToNote },
      { id: "ins-today", label: t("contextMenu.todayDate"), onSelect: deps.insertTodayDateLink },
      { id: "ins-date", label: t("contextMenu.date"), onSelect: deps.insertDate },
      separator("ins-sep-1"),
      { id: "ins-image", label: t("contextMenu.image"), icon: "image", onSelect: deps.insertImage },
      { id: "ins-table", label: t("contextMenu.table"), icon: "table-2", onSelect: deps.insertTable },
      { id: "ins-hr", label: t("contextMenu.horizontalRule"), icon: "minus", onSelect: deps.insertHorizontalRule },
      separator("ins-sep-2"),
      { id: "ins-code", label: t("contextMenu.codeBlock"), icon: "file-code-2", onSelect: deps.insertCodeBlock },
      { id: "ins-quote", label: t("contextMenu.blockquote"), icon: "quote", onSelect: deps.insertBlockquote }
    ]
  };
}

/** Build the List ▸ submenu leaves. */
function buildListSubmenu(deps: EditorMenuDeps): SubmenuSpec {
  return {
    build: () => [
      { id: "list-bullet", label: t("contextMenu.bulletList"), icon: "list", onSelect: deps.toggleBulletList },
      { id: "list-numbered", label: t("contextMenu.numberedList"), icon: "list-ordered", onSelect: deps.toggleNumberedList },
      { id: "list-check", label: t("contextMenu.checkList"), icon: "list-checks", onSelect: deps.toggleCheckList },
      { id: "list-simple-check", label: t("contextMenu.simpleCheckList"), icon: "check", onSelect: deps.toggleSimpleCheckList },
      { id: "list-outline", label: t("contextMenu.outlineList"), icon: "list-tree", onSelect: deps.toggleOutlineList }
    ]
  };
}

/**
 * Build the editor right-click menu. The structure is context-aware:
 * clipboard ops are `disabled` unless the prerequisites hold, formatting
 * toggles show a ✓ for active marks, and the Link row becomes Edit/Remove when
 * a link is active on the selection.
 */
export function buildEditorMenu(target: EditorMenuTarget, deps: EditorMenuDeps): MenuItem[] {
  const linkRows: MenuItem[] = target.link
    ? [
        { id: "edit-link", label: t("contextMenu.editLink"), icon: "link", onSelect: deps.editLink },
        { id: "remove-link", label: t("contextMenu.removeLink"), onSelect: deps.removeLink }
      ]
    : [{ id: "link", label: t("contextMenu.link"), icon: "link", disabled: !target.hasSelection, onSelect: deps.openLinkDialog }];

  // Hash-backed image / attachment under the cursor → lead with open actions.
  // (A `src`-only inline image has no attachment blob, so `media` is null then.)
  const mediaRows: MenuItem[] = target.media
    ? [
        {
          id: "media-open-tab",
          label: t("contextMenu.openInNewTab"),
          icon: "external-link",
          onSelect: () => deps.openMediaInNewTab(target.media!)
        },
        {
          id: "media-open-window",
          label: t("contextMenu.openInNewWindow"),
          icon: "focus",
          onSelect: () => deps.openMediaInNewWindow(target.media!)
        },
        separator("sep-media")
      ]
    : [];

  return [
    ...mediaRows,
    // --- clipboard ---
    { id: "cut", label: t("contextMenu.cut"), disabled: !target.hasSelection || !target.editable, onSelect: deps.cut },
    { id: "copy", label: t("contextMenu.copy"), icon: "copy", disabled: !target.hasSelection, onSelect: deps.copy },
    { id: "paste", label: t("contextMenu.paste"), disabled: !target.editable, onSelect: deps.paste },
    {
      id: "paste-plain",
      label: t("contextMenu.pasteAsPlainText"),
      disabled: !target.editable,
      onSelect: deps.pasteAsPlainText
    },
    separator("sep-1"),
    // --- formatting (checked mirrors the active mark on the selection) ---
    { id: "bold", label: t("contextMenu.bold"), icon: "bold", checked: target.bold, onSelect: deps.toggleBold },
    { id: "italic", label: t("contextMenu.italic"), icon: "italic", checked: target.italic, onSelect: deps.toggleItalic },
    { id: "underline", label: t("contextMenu.underline"), icon: "underline", checked: target.underline, onSelect: deps.toggleUnderline },
    { id: "strikethrough", label: t("contextMenu.strikethrough"), icon: "strikethrough", checked: target.strike, onSelect: deps.toggleStrike },
    { id: "code", label: t("contextMenu.code"), icon: "code", checked: target.code, onSelect: deps.toggleCode },
    { id: "highlight", label: t("contextMenu.highlight"), icon: "highlighter", checked: target.highlight, onSelect: deps.toggleHighlight },
    ...linkRows,
    {
      id: "clear-formatting",
      label: t("contextMenu.clearFormatting"),
      icon: "remove-formatting",
      disabled: !target.hasSelection,
      onSelect: deps.clearFormatting
    },
    separator("sep-2"),
    // --- insert + list submenus (one level deep) ---
    { id: "insert", label: t("contextMenu.insert"), icon: "plus", submenu: buildInsertSubmenu(deps) },
    { id: "list", label: t("contextMenu.list"), icon: "list", submenu: buildListSubmenu(deps) },
    separator("sep-3"),
    // --- actions ---
    { id: "copy-block-link", label: t("contextMenu.copyBlockLink"), icon: "link", onSelect: deps.copyBlockLink },
    { id: "find-in-note", label: t("contextMenu.findInNote"), icon: "search", onSelect: deps.findInNote },
    { id: "replace-in-note", label: t("contextMenu.replaceInNote"), onSelect: deps.replaceInNote },
    { id: "command-palette", label: t("contextMenu.commandPalette"), onSelect: deps.openCommandPalette }
  ];
}