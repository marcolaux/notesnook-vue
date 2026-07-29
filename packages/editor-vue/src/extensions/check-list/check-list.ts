/*
Ported from @notesnook/editor (GPL-3.0), extensions/check-list/check-list.ts.

The "simple checkbox" checklist — `<ul class="simple-checklist">` containing
`<li class="simple-checklist--item [checked]">`. This is the mobile editor's
checklist. The rich task-list (`task-list`) is a separate extension with a
header/progress bar; the two share no schema. Schema (parseHTML/renderHTML) is
copied verbatim so mobile notes round-trip byte-for-byte.

Differences from upstream (scoped to this port):
  - The `[]`/`[x]` input rule is dropped (the task-list port dropped its input
    rule too; typing shortcut deferred for consistency).
  - `hasPermission` guards dropped (no toolbar permission system yet).
  - Keyboard shortcut dropped (no `@notesnook/common` `tiptapKeys` dependency).
*/
import { Node, mergeAttributes } from "@tiptap/vue-3";

export interface CheckListOptions {
  itemTypeName: string;
  HTMLAttributes: Record<string, never>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    checkList: {
      /** Toggle a simple check list. */
      toggleCheckList: () => ReturnType;
    };
  }
}

export const CheckListNode = Node.create<CheckListOptions>({
  name: "checkList",

  addOptions() {
    return {
      itemTypeName: "checkListItem",
      HTMLAttributes: {}
    };
  },

  group: "block list",

  content() {
    return `${this.options.itemTypeName}+`;
  },

  parseHTML() {
    return [{ tag: "ul.simple-checklist", priority: 51 }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "ul",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: "simple-checklist" }),
      0
    ];
  },

  addCommands() {
    return {
      toggleCheckList:
        () =>
        ({ commands }) =>
          commands.toggleList(this.name, this.options.itemTypeName)
    };
  }
});