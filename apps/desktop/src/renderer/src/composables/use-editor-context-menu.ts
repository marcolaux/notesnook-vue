/**
 * Editor context-menu composable — the wiring layer for the editor right-click
 * menu. Mirrors `useNoteContextMenu` for the note-row menu: it owns NO domain
 * logic (the pure entry builder lives in `utils/editor-context-menu.ts`); it
 * only captures a right-click snapshot of the TipTap editor's state, builds the
 * dep callback bag from the real editor commands + stores + bridges, and opens
 * the `ContextMenu` overlay at the cursor via `useContextMenuStore.show`.
 *
 * `useEditorContextMenu(editor, noteId)` takes the pane's `editor` ref (the
 * same `ShallowRef<Editor | undefined>` `Editor.vue` owns) + the pane's note id
 * (so "Copy deep link to block" targets the pane's own note, not the global
 * activeNote) and returns an `onEditorContext(e)` handler to bind on the editor
 * surface
 * (`@contextmenu="onEditorContext"` — the handler calls `preventDefault` only
 * when it actually shows a menu, so a right-click with no editor falls through
 * to the native menu).
 *
 * Clipboard (Cut/Copy/Paste) is renderer-only:
 *  - Copy/Cut serialize the ProseMirror selection to `{text/html, text/plain}`
 *    via `DOMSerializer` (rich text preserved; does NOT rely on the live DOM
 *    selection, which is lost when the menu overlay takes focus). Cut then
 *    `deleteSelection()`.
 *  - Paste reads the clipboard (`navigator.clipboard.read`, preferring HTML,
 *    falling back to `readText`) and `insertContent`s it through the editor's
 *    parser — the same path as keyboard paste's text/HTML branch (the
 *    attachments-bridge only intercepts file pastes).
 * Clipboard read/write is verified on-site (Electron auto-grants clipboard
 * permissions; the app already uses `navigator.clipboard.writeText`).
 */
import type { ShallowRef, Ref } from "vue";
import type { Editor, JSONContent } from "@tiptap/vue-3";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import { EDITOR_ACTION_BY_ID, linkMarkAttrs, createInternalLink } from "@notesnook-vue/editor-vue";
import { useContextMenuStore } from "@/stores/context-menu";
import { useEditorStore } from "@/stores/editor";
import { useOmnibarStore } from "@/stores/omnibar";
import { useLinkDialogStore } from "@/stores/link-dialog";
import { useEditorLayoutStore, type EditorTab, type EditorSession } from "@/stores/editor-layout";
import type { LayoutSnapshot } from "@contracts/session-state";
import { desktop } from "@/platform/desktop-bridge";
import { readCurrentContext } from "@/platform/account-context";
import { blockIdAtSelection } from "@/utils/editor-block-link";
import {
  buildEditorMenu,
  type EditorMenuTarget,
  type EditorMenuDeps,
  type MediaTarget
} from "@/utils/editor-context-menu";

/** Prepend `https://` when the user entered a scheme-less URL. Leaves
 *  `nn:`/`mailto:`/`tel:`/etc. + already-absolute URLs untouched. */
function normalizeHref(href: string): string {
  const trimmed = href.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function useEditorContextMenu(
  editor: ShallowRef<Editor | undefined>,
  noteId: Ref<string | null>,
  groupId: Ref<string>
) {
  const contextMenu = useContextMenuStore();
  const editorStore = useEditorStore();
  const omnibar = useOmnibarStore();
  const linkDialog = useLinkDialogStore();
  const layout = useEditorLayoutStore();

  /** Run a vendored `EDITOR_ACTION` by id on the pane's editor (no-op if the
   *  editor is gone or the id is unknown). The action's `run` focuses + chains. */
  function runAction(id: string): void {
    const e = editor.value;
    if (!e) return;
    EDITOR_ACTION_BY_ID.get(id)?.run(e);
  }

  // --- clipboard -------------------------------------------------------------

  /** Serialize the PM selection to `{html, text}`, or `null` when empty. */
  function selectionContent(e: Editor): { html: string; text: string } | null {
    const { from, to, empty } = e.state.selection;
    if (empty) return null;
    const slice = e.state.selection.content();
    const div = document.createElement("div");
    div.appendChild(DOMSerializer.fromSchema(e.schema).serializeFragment(slice.content));
    return { html: div.innerHTML, text: e.state.doc.textBetween(from, to, "\n") };
  }

  function copy(): void {
    const e = editor.value;
    if (!e) return;
    const sel = selectionContent(e);
    if (!sel) return;
    const item = new ClipboardItem({
      "text/html": new Blob([sel.html], { type: "text/html" }),
      "text/plain": new Blob([sel.text], { type: "text/plain" })
    });
    void navigator.clipboard.write([item]).catch(() => {
      // Fallback: plain-text-only (e.g. ClipboardItem unavailable in tests).
      void navigator.clipboard.writeText(sel.text).catch(() => {
        /* clipboard unavailable — ignore */
      });
    });
  }

  function cut(): void {
    const e = editor.value;
    if (!e) return;
    if (!selectionContent(e)) return;
    copy();
    e.chain().focus().deleteSelection().run();
  }

  async function paste(): Promise<void> {
    const e = editor.value;
    if (!e) return;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes("text/html")) {
          const html = await (await item.getType("text/html")).text();
          e.chain().focus().insertContent(html).run();
          return;
        }
      }
      for (const item of items) {
        if (item.types.includes("text/plain")) {
          const text = await (await item.getType("text/plain")).text();
          e.chain().focus().insertContent(text).run();
          return;
        }
      }
    } catch {
      // `clipboard.read()` may be denied/unavailable — fall back to text.
      try {
        const text = await navigator.clipboard.readText();
        e.chain().focus().insertContent(text).run();
      } catch {
        /* clipboard unavailable — ignore */
      }
    }
  }

  /** Insert `text` as LITERAL plain text — never parsed as HTML — converting
   *  newlines to hard breaks so multi-line paste preserves line breaks without
   *  carrying any source formatting (marks, links, structure). Each line
   *  becomes a text node; `\n` becomes a `hardBreak` node (StarterKit's
   *  HardBreak). Replaces the current selection, mirroring `insertContent`.
   *  Building text nodes (rather than passing a bare string) is load-bearing:
   *  `insertContent("<b>x</b>")` would parse the string as HTML, defeating the
   *  "without formatting" intent (see the same footgun in `link/insert.ts`). */
  function insertPlainText(e: Editor, text: string): void {
    const lines = text.split("\n");
    const content: JSONContent[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i > 0) content.push({ type: "hardBreak" });
      if (line) content.push({ type: "text", text: line });
    }
    e.chain().focus().insertContent(content).run();
  }

  /** Paste the clipboard's plain-text representation, discarding any HTML/
   *  formatting. `navigator.clipboard.readText()` returns the `text/plain`
   *  representation the source wrote (or a text rendition of rich content), so
   *  this is exactly "paste without formatting". Never throws — a clipboard
   *  read failure (denied/unavailable) is swallowed. No-op when the editor is
   *  not editable. */
  async function pasteAsPlainText(): Promise<void> {
    const e = editor.value;
    if (!e || !e.isEditable) return;
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      /* clipboard read denied/unavailable — ignore */
      return;
    }
    if (text) insertPlainText(e, text);
  }

  // --- links -----------------------------------------------------------------

  async function openLinkDialog(): Promise<void> {
    const e = editor.value;
    if (!e) return;
    const { empty } = e.state.selection;
    const result = await linkDialog.openCreate({ requireText: empty });
    if (!result) return;
    const href = normalizeHref(result.href);
    if (empty) {
      // No selection: insert the link text as a node carrying the `link` mark
      // + a trailing space (mirrors `insertNoteLink`'s empty-selection path;
      // bare-string insert would no-op on a mixed array — use text nodes).
      e.chain()
        .focus()
        .insertContent([
          { type: "text", text: result.text || result.href, marks: [{ type: "link", attrs: linkMarkAttrs(href) }] },
          { type: "text", text: " " }
        ])
        .run();
    } else {
      e.chain().focus().extendMarkRange("link").setMark("link", linkMarkAttrs(href)).run();
    }
  }

  async function editLink(): Promise<void> {
    const e = editor.value;
    if (!e) return;
    const attrs = e.getAttributes("link");
    const initialHref = typeof attrs.href === "string" ? attrs.href : "";
    const result = await linkDialog.openEdit({ href: initialHref, requireText: e.state.selection.empty });
    if (!result) return;
    const href = normalizeHref(result.href);
    e.chain().focus().extendMarkRange("link").setMark("link", linkMarkAttrs(href)).run();
  }

  function removeLink(): void {
    editor.value?.chain().focus().unsetLink().run();
  }

  // --- find / palette --------------------------------------------------------

  /** Copy an `nn://note/<id>?blockId=<id>` deep link to the block at the caret.
   *  Falls back to a note-level `nn://note/<id>` link when no block resolves
   *  (e.g. an empty editor). No-ops when the pane has no note id. */
  function copyBlockLink(): void {
    const e = editor.value;
    const id = noteId.value;
    if (!e || !id) return;
    const blockId = blockIdAtSelection(e);
    const href = createInternalLink("note", id, blockId ? { blockId } : {});
    void navigator.clipboard.writeText(href).catch(() => {
      /* clipboard unavailable — ignore */
    });
  }

  function findInNote(): void {
    if (editorStore.editor === editor.value) editorStore.requestFind();
  }
  function replaceInNote(): void {
    if (editorStore.editor === editor.value) editorStore.requestReplace();
  }
  function openCommandPalette(): void {
    omnibar.openCommands();
  }

  // --- media (image / attachment chip) --------------------------------------

  /** Read a `MediaTarget` off a ProseMirror node, or `null` if it isn't a
   *  hash-backed image / attachment. A `src`-only inline image (external URL /
   *  data URL, no `hash`) has no attachment blob to preview → `null`. */
  function mediaFromNode(node: PMNode | null | undefined): MediaTarget | null {
    if (!node) return null;
    const name = node.type.name;
    if (name !== "image" && name !== "attachment") return null;
    const hash = node.attrs.hash;
    if (!hash || typeof hash !== "string") return null;
    return {
      hash,
      filename: String(node.attrs.filename ?? ""),
      mime: String(node.attrs.mime ?? ""),
      size: Number(node.attrs.size ?? 0)
    };
  }

  /** The hash-backed image / attachment under a right-click, or `null`. ProseMirror
   *  moves a `NodeSelection` onto an atom node (image/attachment) on right-click;
   *  fall back to `posAtCoords` + `nodeAt`/`nodeAfter` for robustness. */
  function mediaUnderClick(ed: Editor, e: MouseEvent): MediaTarget | null {
    const sel = ed.state.selection;
    if (sel instanceof NodeSelection) {
      const m = mediaFromNode(sel.node);
      if (m) return m;
    }
    try {
      const pos = ed.view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (pos) {
        const m = mediaFromNode(ed.state.doc.nodeAt(pos.pos) ?? null);
        if (m) return m;
        const $p = ed.state.doc.resolve(pos.pos);
        return mediaFromNode($p.nodeAfter ?? null);
      }
    } catch {
      /* posAtCoords can throw outside the editor — ignore */
    }
    return null;
  }

  /** Open the image/attachment as a new attachment-preview tab in this pane's
   *  group (reuses an existing tab for the same hash). */
  function openMediaInNewTab(attrs: MediaTarget): void {
    const gid = groupId.value;
    if (!gid) return;
    layout.openAttachmentTab(gid, {
      hash: attrs.hash,
      filename: attrs.filename,
      mime: attrs.mime,
      size: attrs.size
    });
  }

  /** Build a one-attachment {@link LayoutSnapshot} (a single root group with one
   *  attachment tab) for a focus-mode pane window. Mirrors what
   *  `detachGroupSnapshot` produces for a single-tab pane. */
  function buildAttachmentFocusSnapshot(attrs: MediaTarget): LayoutSnapshot {
    const tabId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const gid = crypto.randomUUID();
    const tab: EditorTab = {
      id: tabId,
      groupId: gid,
      kind: "attachment",
      attachment: {
        hash: attrs.hash,
        filename: attrs.filename,
        mime: attrs.mime,
        size: attrs.size
      },
      sessionId,
      history: [],
      historyIndex: 0
    };
    const session: EditorSession = { id: sessionId, tabId, type: "attachment" };
    return {
      layout: { id: crypto.randomUUID(), type: "group", groupId: gid },
      groups: { [gid]: { id: gid, activeTabId: tabId } },
      tabs: { [tabId]: tab },
      sessions: { [sessionId]: session },
      activeGroupId: gid
    };
  }

  /** Open the image/attachment in a new focus-mode window (a single-attachment
   *  pane window; main appends `&focus=1` so the pane enables focus mode). */
  function openMediaInNewWindow(attrs: MediaTarget): void {
    const snapshot = buildAttachmentFocusSnapshot(attrs);
    const contextId = readCurrentContext();
    void desktop.window.openPaneWindow
      .mutate({ snapshot, contextId, focus: true })
      .catch(() => undefined);
  }

  /** Build the dep bag. Rebuilt per right-click so the closures always see the
   *  latest `editor.value` (e.g. after a tab switch under KeepAlive). */
  function buildDeps(): EditorMenuDeps {
    return {
      cut,
      copy,
      paste,
      pasteAsPlainText,
      toggleBold: () => runAction("bold"),
      toggleItalic: () => runAction("italic"),
      toggleUnderline: () => runAction("underline"),
      toggleStrike: () => runAction("strikethrough"),
      toggleCode: () => runAction("code"),
      toggleHighlight: () => runAction("highlight"),
      clearFormatting: () => runAction("clearFormatting"),
      openLinkDialog,
      editLink,
      removeLink,
      linkToNote: () => runAction("linkNote"),
      insertTodayDateLink: () => runAction("insertTodayDateLink"),
      insertDate: () => runAction("insertDate"),
      insertImage: () => runAction("image"),
      insertTable: () => runAction("table"),
      insertHorizontalRule: () => runAction("horizontalRule"),
      insertCodeBlock: () => runAction("codeBlock"),
      insertBlockquote: () => runAction("blockquote"),
      toggleBulletList: () => runAction("bulletList"),
      toggleNumberedList: () => runAction("numberedList"),
      toggleCheckList: () => runAction("checkList"),
      toggleSimpleCheckList: () => runAction("simpleCheckList"),
      toggleOutlineList: () => runAction("outlineList"),
      copyBlockLink,
      findInNote,
      replaceInNote,
      openCommandPalette,
      openMediaInNewTab,
      openMediaInNewWindow
    };
  }

  /** The `@contextmenu` handler for the editor surface. Captures the PM
   *  selection/marks snapshot, builds the menu, and shows it at the cursor.
   *  Prevents the native browser menu only when a menu is actually shown. */
  function onEditorContext(e: MouseEvent): void {
    const ed = editor.value;
    if (!ed) return;
    const sel = ed.state.selection;
    const target: EditorMenuTarget = {
      hasSelection: !sel.empty,
      editable: ed.isEditable,
      bold: ed.isActive("bold"),
      italic: ed.isActive("italic"),
      underline: ed.isActive("underline"),
      strike: ed.isActive("strike"),
      code: ed.isActive("code"),
      highlight: ed.isActive("highlight"),
      link: ed.isActive("link") ? { href: String(ed.getAttributes("link").href ?? "") } : null,
      media: mediaUnderClick(ed, e)
    };
    e.preventDefault();
    contextMenu.show(buildEditorMenu(target, buildDeps()), e.clientX, e.clientY);
  }

  return { onEditorContext, pasteAsPlainText };
}