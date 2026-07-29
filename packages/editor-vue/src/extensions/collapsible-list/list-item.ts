/*
Collapsible list item — gives the shared `listItem` a Vue node-view that
renders an in-place chevron toggle whenever the item contains a child
`bulletList` or `orderedList`.

Extends TipTap's stock `@tiptap/extension-list-item`, inheriting its content
model (`paragraph block*`) and the Enter/Tab/Shift-Tab (split/sink/lift) key
bindings. Only `addNodeView` is overridden.

Because `listItem` is shared by `bulletList` and `orderedList`, this one
node-view makes BOTH list types collapsible. It does not touch `taskItem`,
`checkListItem`, or `outlineListItem` (those list types each ship their own
item node), so it does not leak into them.

Mirrors ../outline-list/OutlineListItemView.vue: every item draws its own `•`
marker (the native ::marker is suppressed via CSS, so the bullet list renders
identically to the outline list), and items that have a child list add a
chevron in the left gutter. Ordered lists keep their native numbers — CSS
hides the dot for `ol`. Leaf items render the dot (bullet) or just their
content (ordered).
*/
import { ListItem } from "@tiptap/extension-list-item";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import CollapsibleListItemView from "./CollapsibleListItemView.vue";

export const CollapsibleListItem = ListItem.extend({
  addNodeView() {
    return VueNodeViewRenderer(CollapsibleListItemView);
  }
});