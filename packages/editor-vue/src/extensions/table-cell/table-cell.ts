/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

... (GPL-3.0 header, see LICENSE) ...

Ported to Vue 3 + TipTap (packages/editor-vue). Schema/parseHTML/renderHTML
and `addTableCellAttributes` are verbatim from @notesnook/editor (GPL-3.0),
table-cell/table-cell.ts — only the import source changed (`@tiptap/core` →
`@tiptap/vue-3`, which re-exports core) so the editor and extensions share
one ProseMirror schema.
*/
import { mergeAttributes, Node, type Attribute } from "@tiptap/vue-3";

import { addStyleAttribute } from "./utils";

export interface TableCellOptions {
  /**
   * The HTML attributes for a table cell node.
   * @default {}
   * @example { class: 'foo' }
   */
  HTMLAttributes: Record<string, unknown>;
}

/**
 * This extension allows you to create table cells.
 * @see https://www.tiptap.dev/api/nodes/table-cell
 */
export const TableCell = Node.create<TableCellOptions>({
  name: "tableCell",

  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },

  content: "block+",

  addAttributes() {
    return addTableCellAttributes();
  },

  tableRole: "cell",

  isolating: true,

  parseHTML() {
    return [{ tag: "td" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "td",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0
    ];
  }
});

export function addTableCellAttributes(): Record<string, Attribute> {
  return {
    colwidth: {
      default: null,
      parseHTML(element) {
        const widthAttr =
          element.getAttribute("data-colwidth") ||
          element.getAttribute("colwidth");
        const widths =
          widthAttr && /^\d+(,\d+)*$/.test(widthAttr)
            ? widthAttr.split(",").map((s) => Number(s))
            : null;
        const colspan = Number(element.getAttribute("colspan") || 1);

        // migrate to data-colwidth attribute
        if (element.hasAttribute("colwidth")) {
          element.setAttribute(
            "data-colwidth",
            element.getAttribute("colwidth")!
          );
          element.removeAttribute("colwidth");
        }

        return widths && widths.length == colspan ? widths : null;
      },
      renderHTML(attributes) {
        if (!attributes.colwidth) {
          return {};
        }
        return {
          "data-colwidth": attributes.colwidth.join(",")
        };
      }
    },
    colspan: {
      default: 1,
      parseHTML(element) {
        return Number(element.getAttribute("colspan") || 1);
      },
      renderHTML(attributes) {
        return {
          colspan: attributes.colspan || 1
        };
      }
    },
    rowspan: {
      default: 1,
      parseHTML(element) {
        return Number(element.getAttribute("rowspan") || 1);
      },
      renderHTML(attributes) {
        return {
          rowspan: attributes.rowspan || 1
        };
      }
    },
    backgroundColor: addStyleAttribute("backgroundColor", "background-color"),
    color: addStyleAttribute("color", "color"),
    borderWidth: addStyleAttribute("borderWidth", "border-width", "px"),
    borderStyle: addStyleAttribute("borderStyle", "border-style"),
    borderColor: addStyleAttribute("borderColor", "border-color")
  };
}