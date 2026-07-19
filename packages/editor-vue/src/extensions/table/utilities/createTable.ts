/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

... (GPL-3.0 header, see LICENSE) ...

Ported to Vue 3 + TipTap (packages/editor-vue). Verbatim from
@notesnook/editor (GPL-3.0), table/utilities/createTable.ts — only the import
source changed (`prosemirror-model` → `@tiptap/pm/model`). `!` assertions on
`types.<role>` silence `noUncheckedIndexedAccess` (the roles always exist in a
table schema).
*/
import type {
  Fragment,
  Node as ProsemirrorNode,
  Schema
} from "@tiptap/pm/model";

import { createCell } from "./createCell";
import { getTableNodeTypes } from "./getTableNodeTypes";

export function createTable(
  schema: Schema,
  rowsCount: number,
  colsCount: number,
  withHeaderRow: boolean,
  cellContent?: Fragment | ProsemirrorNode | Array<ProsemirrorNode>,
  defaultCellAttrs?: { colwidth?: number[] }
): ProsemirrorNode {
  const types = getTableNodeTypes(schema);
  const headerCells: ProsemirrorNode[] = [];
  const cells: ProsemirrorNode[] = [];

  for (let index = 0; index < colsCount; index += 1) {
    const cell = createCell(types.cell!, cellContent, defaultCellAttrs);

    if (cell) {
      cells.push(cell);
    }

    if (withHeaderRow) {
      const headerCell = createCell(
        types.header_cell!,
        cellContent,
        defaultCellAttrs
      );

      if (headerCell) {
        headerCells.push(headerCell);
      }
    }
  }

  const rows: ProsemirrorNode[] = [];

  for (let index = 0; index < rowsCount; index += 1) {
    rows.push(
      types.row!.createChecked(
        null,
        withHeaderRow && index === 0 ? headerCells : cells
      )
    );
  }

  return types.table!.createChecked(null, rows);
}