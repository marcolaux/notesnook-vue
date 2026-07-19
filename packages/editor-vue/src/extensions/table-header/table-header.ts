/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

... (GPL-3.0 header, see LICENSE) ...

Ported to Vue 3 + TipTap (packages/editor-vue). Schema/parseHTML/renderHTML
verbatim from @notesnook/editor (GPL-3.0), table-header/table-header.ts —
reuses `addTableCellAttributes` from `../table-cell/table-cell` and imports
from `@tiptap/vue-3` (re-exports core) so the editor and extensions share one
ProseMirror schema.
*/
import { mergeAttributes, Node } from "@tiptap/vue-3";

import { addTableCellAttributes } from "../table-cell/table-cell";

export interface TableHeaderOptions {
  /**
   * The HTML attributes for a table header node.
   * @default {}
   * @example { class: 'foo' }
   */
  HTMLAttributes: Record<string, unknown>;
}

/**
 * This extension allows you to create table headers.
 * @see https://www.tiptap.dev/api/nodes/table-header
 */
export const TableHeader = Node.create<TableHeaderOptions>({
  name: "tableHeader",

  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },

  content: "block+",

  addAttributes() {
    return addTableCellAttributes();
  },

  tableRole: "header_cell",

  isolating: true,

  parseHTML() {
    return [{ tag: "th" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "th",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0
    ];
  }
});