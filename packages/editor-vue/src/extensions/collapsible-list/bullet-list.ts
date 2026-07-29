/*
Collapsible bullet list.

We *extend* TipTap's stock `@tiptap/extension-bullet-list` (rather than replace
it) so everything the plain bullet list already does is inherited unchanged:
the `toggleBulletList` command, the `Mod-Shift-8` shortcut, and crucially the
`/^\s*([-+*])\s$/` markdown input rule (`- `/`* `/`+ `). The only addition is a
`collapsed` boolean attribute on the list node, serialised as
`data-collapsed="true"`. The chevron that toggles it lives on the shared
`listItem` node-view (see list-item.ts), so this attribute alone is enough.

Mirrors the upstream `outlineList` extension's `collapsed` attribute exactly
(see ../outline-list/outline-list.ts), so the two collapse mechanisms are
consistent and a single CSS rule hides either when collapsed.
*/
import { BulletList } from "@tiptap/extension-bullet-list";

export const CollapsibleBulletList = BulletList.extend({
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