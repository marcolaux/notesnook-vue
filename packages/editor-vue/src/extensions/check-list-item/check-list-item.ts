/*
Ported from @notesnook/editor (GPL-3.0), extensions/check-list-item/check-list-item.ts.

This is the "simple checkbox" checklist item — the mobile editor's checklist.
Stored notes use `<li class="simple-checklist--item [checked]">` (inside
`<ul class="simple-checklist">`). Unlike the rich task-list (`task-item`), the
simple checklist draws its checkbox purely in CSS (a `::after`/`::before`
square on the `<li>`) and toggles via a left-edge click hit-area — no Vue
node-view component, no drag grip, no progress bar / header. Schema
(addAttributes/parseHTML/renderHTML) is copied verbatim so mobile notes
round-trip byte-for-byte.

Differences from upstream (scoped to this port):
  - `onReadOnlyChecked` option dropped (no read-only editor surface yet).
  - Keyboard-shortcut key strings inlined (no `@notesnook/common` `keybindings`
    dependency — editor-vue stays self-contained).
*/
import { Node, mergeAttributes, type KeyboardShortcutCommand } from "@tiptap/vue-3";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { ensureLeadingParagraph, findParentNodeClosestToPos } from "../../utils/prosemirror";

export type { CheckListItemAttributes } from "./types";

export interface CheckListItemOptions {
  /** When true, a check item may contain a nested `checkList` (Tab sinks, the
   *  nested list renders as a child `<ul class="simple-checklist">`). */
  nested: boolean;
  HTMLAttributes: Record<string, never>;
}

export const CheckListItemNode = Node.create<CheckListItemOptions>({
  name: "checkListItem",

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
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "li.simple-checklist--item",
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
    const shortcuts: Record<string, KeyboardShortcutCommand> = {
      Enter: () => this.editor.commands.splitListItem(this.name),
      "Shift-Tab": () => this.editor.commands.liftListItem(this.name)
    };
    if (!this.options.nested) return shortcuts;
    return {
      ...shortcuts,
      Tab: () => this.editor.commands.sinkListItem(this.name)
    };
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const li = document.createElement("li");
      if (node.attrs.checked) li.classList.add("checked");
      else li.classList.remove("checked");

      function onClick(e: MouseEvent | TouchEvent): void {
        if (e instanceof MouseEvent && e.button !== 0) return;
        if (!(e.target instanceof HTMLElement)) return;

        const pos = typeof getPos === "function" ? getPos() : 0;
        if (typeof pos !== "number") return;
        const resolvedPos = editor.state.doc.resolve(pos);

        const { x, y, right } = li.getBoundingClientRect();
        const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0]?.clientX ?? 0;
        const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0]?.clientY ?? 0;

        const hitArea = { width: 40, height: 40 };

        // RTL if the row itself is `dir="rtl"` or an ancestor block carries a
        // `textDirection` attribute (mirrors upstream's RTL hit-area flip).
        const isRtl =
          e.target.dir === "rtl" ||
          Boolean(
            findParentNodeClosestToPos(resolvedPos, (n) => Boolean(n.attrs.textDirection))
          );

        let xStart = clientX >= x - hitArea.width;
        let xEnd = clientX <= x;
        const yStart = clientY >= y;
        const yEnd = clientY <= y + hitArea.height;

        if (isRtl) {
          xEnd = clientX <= right + hitArea.width;
          xStart = clientX >= right;
        }

        if (xStart && xEnd && yStart && yEnd) {
          e.preventDefault();
          editor.commands.command(({ tr }) => {
            tr.setNodeAttribute(pos, "checked", !li.classList.contains("checked"));
            return true;
          });
        }
      }

      li.onmousedown = onClick;
      li.ontouchstart = onClick;

      return {
        dom: li,
        contentDOM: li,
        update: (updatedNode: ProseMirrorNode) => {
          if (updatedNode.type !== this.type) {
            return false;
          }
          // A nested checkList is allowed as the last child (nested option); PM
          // renders it into our `li` contentDOM. We only sync the checked class.
          if (updatedNode.attrs.checked) li.classList.add("checked");
          else li.classList.remove("checked");
          return true;
        }
      };
    };
  }
});