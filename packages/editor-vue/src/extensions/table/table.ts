/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

... (GPL-3.0 header, see LICENSE) ...

Ported to Vue 3 + TipTap (packages/editor-vue). Schema/parseHTML/renderHTML,
commands, keyboard shortcuts and `extendNodeSchema` are verbatim from
@notesnook/editor (GPL-3.0), table/table.ts. The React node-view layer is
replaced: the table DOM is owned by `TableComponent.vue` via
`VueNodeViewRenderer` (installed through `addNodeView`), and `columnResizing`
is passed `View: null` so the plugin does NOT install a competing node-view
(it still draws the `.column-resize-handle` / `.selectedCell` decorations and
finds our `<table>` by walking the DOM). `tableUpdate` adds a colwidth
fingerprint to upstream's `shouldUpdate` so non-drag width/merge changes
re-sync the colgroup. CSV export/import commands are omitted (deferred). Import
sources changed (`@tiptap/core` → `@tiptap/vue-3`, `prosemirror-*` →
`@tiptap/pm/*`) so the editor and extensions share one ProseMirror schema.
*/
import {
  callOrReturn,
  getExtensionField,
  mergeAttributes,
  Node,
  VueNodeViewRenderer,
  type ParentConfig
} from "@tiptap/vue-3";
import type { DOMOutputSpec, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

import TableComponent from "./TableComponent.vue";
import { createColGroup } from "./utilities/createColGroup";
import { createTable } from "./utilities/createTable";
import { deleteTableWhenAllCellsSelected } from "./utilities/deleteTableWhenAllCellsSelected";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  goToNextCell,
  mergeCells,
  setCellAttr,
  splitCell,
  toggleHeader,
  toggleHeaderCell
} from "./prosemirror-tables/commands";
import { fixTables } from "./prosemirror-tables/fixtables";
import { CellSelection } from "./prosemirror-tables/cellselection";
import { columnResizing } from "./prosemirror-tables/columnresizing";
import { tableEditing } from "./prosemirror-tables/index";
import { hasSameAttributes } from "../../utils/prosemirror";

export interface TableOptions {
  /**
   * HTML attributes for the table element.
   * @default {}
   * @example { class: 'foo' }
   */
  HTMLAttributes: Record<string, unknown>;

  /**
   * Enables the resizing of tables.
   * @default false
   * @example true
   */
  resizable: boolean;

  /**
   * The minimum width of a cell.
   * @default 25
   * @example 50
   */
  cellMinWidth: number;

  showResizeHandleOnSelection: boolean;

  /**
   * Allow table node selection.
   * @default false
   * @example true
   */
  allowTableNodeSelection: boolean;

  defaultCellAttrs: { colwidth?: number[] };
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    table: {
      /** Insert a table */
      insertTable: (options?: {
        rows?: number;
        cols?: number;
        withHeaderRow?: boolean;
      }) => ReturnType;
      /** Add a column before the current column */
      addColumnBefore: () => ReturnType;
      /** Add a column after the current column */
      addColumnAfter: () => ReturnType;
      /** Delete the current column */
      deleteColumn: () => ReturnType;
      /** Add a row before the current row */
      addRowBefore: () => ReturnType;
      /** Add a row after the current row */
      addRowAfter: () => ReturnType;
      /** Delete the current row */
      deleteRow: () => ReturnType;
      /** Delete the current table */
      deleteTable: () => ReturnType;
      /** Merge the currently selected cells */
      mergeCells: () => ReturnType;
      /** Split the currently selected cell */
      splitCell: () => ReturnType;
      /** Toggle the header column */
      toggleHeaderColumn: () => ReturnType;
      /** Toggle the header row */
      toggleHeaderRow: () => ReturnType;
      /** Toggle the header cell */
      toggleHeaderCell: () => ReturnType;
      /** Merge or split the currently selected cells */
      mergeOrSplit: () => ReturnType;
      /** Set a cell attribute */
      setCellAttribute: (name: string, value: unknown) => ReturnType;
      /** Moves the selection to the next cell */
      goToNextCell: () => ReturnType;
      /** Moves the selection to the previous cell */
      goToPreviousCell: () => ReturnType;
      /** Try to fix the table structure if necessary */
      fixTables: () => ReturnType;
      /** Set a cell selection inside the current table */
      setCellSelection: (position: {
        anchorCell: number;
        headCell?: number;
      }) => ReturnType;
    };
  }

  interface NodeConfig<Options, Storage> {
    /**
     * A string or function to determine the role of the table.
     * @default 'table'
     * @example () => 'table'
     */
    tableRole?:
      | string
      | ((this: {
          name: string;
          options: Options;
          storage: Storage;
          parent: ParentConfig<NodeConfig<Options>>["tableRole"];
        }) => string);
  }
}

/**
 * Cheap signature of the first row's column widths so pure `colwidth`/`colspan`
 * changes (resize, merge, split) trigger a node-view re-render and the colgroup
 * is re-synced via `updateColumnsOnResize`. Content edits inside a cell change
 * neither `childCount` nor this fingerprint, so they do NOT re-render (no caret
 * jump). Upstream's `shouldUpdate` (attrs + childCount + firstChild.childCount)
 * alone misses these cases.
 */
function colwidthFingerprint(node: ProseMirrorNode): string {
  const firstRow = node.firstChild;
  if (!firstRow) return "";
  let s = "";
  firstRow.forEach((cell) => {
    const colspan = (cell.attrs.colspan as number) ?? 1;
    const colwidth = cell.attrs.colwidth as number[] | null;
    s += `${colspan}:${colwidth ? colwidth.join("-") : ""}|`;
  });
  return s;
}

function tableUpdate(prev: ProseMirrorNode, next: ProseMirrorNode): boolean {
  return (
    !hasSameAttributes(
      prev.attrs as Record<string, unknown>,
      next.attrs as Record<string, unknown>
    ) ||
    prev.childCount !== next.childCount ||
    prev.firstChild?.childCount !== next.firstChild?.childCount ||
    colwidthFingerprint(prev) !== colwidthFingerprint(next)
  );
}

/**
 * This extension allows you to create tables.
 * @see https://www.tiptap.dev/api/nodes/table
 */
export const Table = Node.create<TableOptions>({
  name: "table",

  addOptions() {
    return {
      HTMLAttributes: {},
      resizable: false,
      showResizeHandleOnSelection: false,
      cellMinWidth: 25,
      allowTableNodeSelection: false,
      defaultCellAttrs: {}
    };
  },

  content: "tableRow+",

  tableRole: "table",

  isolating: true,

  group: "block",

  parseHTML() {
    return [{ tag: "table" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { colgroup, tableWidth, tableMinWidth } = createColGroup(
      node,
      this.options.cellMinWidth
    );

    const table: DOMOutputSpec = [
      "table",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        style: tableWidth
          ? `width: ${tableWidth}`
          : `min-width: ${tableMinWidth}`
      }),
      colgroup,
      ["tbody", 0]
    ];

    return table;
  },

  addCommands() {
    return {
      insertTable:
        ({ rows = 3, cols = 3, withHeaderRow = true } = {}) =>
        ({ tr, dispatch, editor }) => {
          const node = createTable(
            editor.schema,
            rows,
            cols,
            withHeaderRow,
            undefined,
            this.options.defaultCellAttrs
          );

          if (dispatch) {
            const offset = tr.selection.from + 1;

            tr.replaceSelectionWith(node)
              .scrollIntoView()
              .setSelection(TextSelection.near(tr.doc.resolve(offset)));
          }

          return true;
        },
      addColumnBefore:
        () =>
        ({ state, dispatch }) => {
          return addColumnBefore(
            state,
            dispatch,
            this.options.defaultCellAttrs
          );
        },
      addColumnAfter:
        () =>
        ({ state, dispatch }) => {
          return addColumnAfter(state, dispatch, this.options.defaultCellAttrs);
        },
      deleteColumn:
        () =>
        ({ state, dispatch }) => {
          return deleteColumn(state, dispatch);
        },
      addRowBefore:
        () =>
        ({ state, dispatch }) => {
          return addRowBefore(state, dispatch);
        },
      addRowAfter:
        () =>
        ({ state, dispatch }) => {
          return addRowAfter(state, dispatch);
        },
      deleteRow:
        () =>
        ({ state, dispatch }) => {
          return deleteRow(state, dispatch);
        },
      deleteTable:
        () =>
        ({ state, dispatch }) => {
          return deleteTable(state, dispatch);
        },
      mergeCells:
        () =>
        ({ state, dispatch }) => {
          return mergeCells(state, dispatch);
        },
      splitCell:
        () =>
        ({ state, dispatch }) => {
          return splitCell(state, dispatch);
        },
      toggleHeaderColumn:
        () =>
        ({ state, dispatch }) => {
          return toggleHeader("column")(state, dispatch);
        },
      toggleHeaderRow:
        () =>
        ({ state, dispatch }) => {
          return toggleHeader("row")(state, dispatch);
        },
      toggleHeaderCell:
        () =>
        ({ state, dispatch }) => {
          return toggleHeaderCell(state, dispatch);
        },
      mergeOrSplit:
        () =>
        ({ state, dispatch }) => {
          if (mergeCells(state, dispatch)) {
            return true;
          }

          return splitCell(state, dispatch);
        },
      setCellAttribute:
        (name, value) =>
        ({ state, dispatch }) => {
          return setCellAttr(name, value)(state, dispatch);
        },
      goToNextCell:
        () =>
        ({ state, dispatch }) => {
          return goToNextCell(1)(state, dispatch);
        },
      goToPreviousCell:
        () =>
        ({ state, dispatch }) => {
          return goToNextCell(-1)(state, dispatch);
        },
      fixTables:
        () =>
        ({ state, dispatch }) => {
          if (dispatch) {
            fixTables(state);
          }

          return true;
        },
      setCellSelection:
        (position) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            const selection = CellSelection.create(
              tr.doc,
              position.anchorCell,
              position.headCell
            );

            tr.setSelection(selection);
          }

          return true;
        }
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.commands.goToNextCell()) {
          return true;
        }

        if (!this.editor.can().addRowAfter()) {
          return false;
        }

        return this.editor.chain().addRowAfter().goToNextCell().run();
      },
      "Shift-Tab": () => this.editor.commands.goToPreviousCell(),
      Backspace: deleteTableWhenAllCellsSelected,
      "Mod-Backspace": deleteTableWhenAllCellsSelected,
      Delete: deleteTableWhenAllCellsSelected,
      "Mod-Delete": deleteTableWhenAllCellsSelected
    };
  },

  addNodeView() {
    return VueNodeViewRenderer(TableComponent, {
      update: ({ oldNode, newNode }) => tableUpdate(oldNode, newNode)
    });
  },

  addProseMirrorPlugins() {
    const isResizable = this.options.resizable && this.editor.isEditable;

    return [
      ...(isResizable
        ? [
            columnResizing({
              cellMinWidth: this.options.cellMinWidth,
              View: null,
              showResizeHandleOnSelection: this.options.showResizeHandleOnSelection
            })
          ]
        : []),
      tableEditing({
        allowTableNodeSelection: this.options.allowTableNodeSelection
      })
    ];
  },

  extendNodeSchema(extension) {
    const context = {
      name: extension.name,
      options: extension.options,
      storage: extension.storage
    };

    return {
      tableRole: callOrReturn(
        getExtensionField(extension, "tableRole", context)
      )
    };
  }
});