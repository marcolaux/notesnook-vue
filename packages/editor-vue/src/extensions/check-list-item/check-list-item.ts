/*
Ported from @notesnook/editor (GPL-3.0), extensions/check-list-item/check-list-item.ts.

This is the "simple checkbox" checklist item — the mobile editor's checklist.
Stored notes use `<li class="simple-checklist--item [checked]" data-indent?>`
(inside `<ul class="simple-checklist">`). The schema (addAttributes/parseHTML/
renderHTML) is copied verbatim so mobile notes round-trip byte-for-byte.

Row rendering is SHARED with the rich task-list: the node-view is the SAME
`TaskItemComponent` the rich `taskItem` uses, so a simple-checklist row renders
identically to an Aufgabenliste row — same real `<button>` checkbox (no CSS
`::after`/`::before` square), same drag grip, same spacing, same checked
dimming, and the SAME `data-indent` visual-indent model (Tab/Shift-Tab adjust
the `indent` attribute, no real nested `<ul>`). Only the container differs:
the rich list wraps items in a card with a header/progress bar
(`TaskListComponent`); the simple list is a bare `<ul class="simple-checklist">`.

The schema stays permissive (`nested` → content `paragraph block*`) so existing
notes with real nested `<ul class="simple-checklist">` still parse and render
nested — mobile byte-for-byte round-trip is preserved. New Tab-indent adds
`data-indent` padding instead of creating nested lists, matching the rich row.

Differences from upstream (scoped to this port):
  - `onReadOnlyChecked` option dropped (no read-only editor surface yet).
  - Keyboard-shortcut key strings inlined (no `@notesnook/common` `keybindings`
    dependency — editor-vue stays self-contained).
  - The CSS-drawn checkbox node-view is replaced by the shared Vue row
    component (see above); the click hit-area is now the component's `<button>`.
*/
import { Node, mergeAttributes, VueNodeViewRenderer } from "@tiptap/vue-3";
import TaskItemComponent from "../task-item/TaskItemComponent.vue";
import { ensureLeadingParagraph } from "../../utils/prosemirror";
import { MAX_LIST_INDENT, adjustListIndent } from "../../utils/list-indent";

export type { CheckListItemAttributes } from "./types";

export interface CheckListItemOptions {
  /** When true, a check item may contain a nested `checkList` (legacy notes
   *  round-trip with real nested `<ul class="simple-checklist">`). New
   *  indentation is visual via `data-indent`, NOT real nesting. */
  nested: boolean;
  HTMLAttributes: Record<string, never>;
}

export const CheckListItemNode = Node.create<CheckListItemOptions>({
  name: "checkListItem",

  draggable: true,

  addOptions() {
    return {
      nested: false,
      HTMLAttributes: {}
    };
  },

  content() {
    return this.options.nested ? "paragraph block*" : "paragraph+";
  },

  defining: true,

  addAttributes() {
    return {
      checked: {
        default: false,
        keepOnSplit: false,
        parseHTML: (element) => element.classList.contains("checked"),
        renderHTML: (attributes) => ({
          class: attributes.checked ? "checked" : ""
        })
      },
      // Visual-only indentation, mirroring the rich `taskItem`. Tab/Shift-Tab
      // adjust this instead of sinking/lifting into a nested
      // `<ul class="simple-checklist">` — so a simple-checklist row indents the
      // SAME 20px-per-level as an Aufgabenliste row. Stored as `data-indent` on
      // the `<li>`; rendered as left padding by the shared TaskItemComponent.
      // Existing notes that predate this (real nested `<ul>`) keep parsing
      // nested (the `nested` content model allows it); their `indent` is 0.
      indent: {
        default: 0,
        keepOnSplit: true,
        parseHTML: (element) => {
          const n = Number(element.dataset.indent);
          return Number.isFinite(n) && n > 0
            ? Math.min(MAX_LIST_INDENT, Math.floor(n))
            : 0;
        },
        renderHTML: (attributes) => {
          const n = Number(attributes.indent ?? 0);
          return n > 0 ? { "data-indent": String(n) } : {};
        }
      }
    };
  },

  parseHTML() {
    return [
      // Parent-based (like the rich `taskItem`'s `.checklist > li`): matches
      // BOTH the serialized DOM (`li.simple-checklist--item` inside
      // `ul.simple-checklist`, from `renderHTML`) AND the live editor DOM
      // (`li.checklist--item` inside `ul.simple-checklist`, from the shared
      // TaskItemComponent node-view). A class-based rule would miss the live
      // DOM (its class is `checklist--item`, not `simple-checklist--item`) and
      // ProseMirror's DOM-reparse fallback would fail to recognise the item.
      // Priority 51 beats the generic `listItem` (`li`, default 50).
      {
        tag: ".simple-checklist > li",
        priority: 51,
        getContent: ensureLeadingParagraph
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "li",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: "simple-checklist--item"
      }),
      0
    ];
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem(this.name),
      // Tab/Shift-Tab adjust the visual `indent` attribute (shared helper),
      // matching the rich task-list. At the floor (indent 0) Shift-Tab is a
      // no-op; at the ceiling (MAX_LIST_INDENT) Tab is a no-op. When the caret
      // is not inside a check item, both return false so other handlers claim
      // the key.
      Tab: () => adjustListIndent(this.editor, this.name, +1),
      "Shift-Tab": () => adjustListIndent(this.editor, this.name, -1)
    };
  },

  addNodeView() {
    // Reuse the rich task-list row component so simple-checklist rows render
    // identically to Aufgabenliste rows (same checkbox button, grip, spacing,
    // checked dimming, `data-indent` indent). The component is type-agnostic
    // (reads `node.attrs.checked`/`indent`); serialization stays type-specific
    // via `renderHTML` above (`simple-checklist--item` for round-trip).
    return VueNodeViewRenderer(TaskItemComponent);
  }
});