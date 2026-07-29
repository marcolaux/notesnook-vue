/*
Collapsible ordered (numbered) list.

Extends TipTap's stock `@tiptap/extension-ordered-list`, inheriting
`toggleOrderedList`, `Mod-Shift-7`, the `1.` input rule, and the `start`/`type`
attributes. Adds only a `collapsed` boolean attribute (serialised as
`data-collapsed="true"`). The chevron that toggles it lives on the shared
`listItem` node-view (see list-item.ts).

Ordered lists become collapsible as a side effect of giving the shared
`listItem` a node-view (TipTap's stock `listItem` is used by both bullet and
ordered lists) — see the plan / outline-list for the rationale.
*/
import { OrderedList } from "@tiptap/extension-ordered-list";

export const CollapsibleOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-collapsed") === "true",
        renderHTML: (attributes: { collapsed: boolean }) => {
          if (!attributes.collapsed) return {};
          return { "data-collapsed": "true" };
        }
      }
    };
  }
});