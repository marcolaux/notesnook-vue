/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

... (GPL-3.0 header, see LICENSE) ...

Ported to Vue 3 + TipTap (packages/editor-vue). Verbatim from
@notesnook/editor (GPL-3.0), table/utilities/deleteTableWhenAllCellsSelected.ts
— import source changed (`@tiptap/core` → `@tiptap/vue-3`); `!` on
`selection.ranges[0]` silences `noUncheckedIndexedAccess` (a CellSelection always
has at least one range).
*/
import { findParentNodeClosestToPos, type KeyboardShortcutCommand } from "@tiptap/vue-3";

import { isCellSelection } from "./isCellSelection";

export const deleteTableWhenAllCellsSelected: KeyboardShortcutCommand = ({
  editor
}) => {
  const { selection } = editor.state;

  if (!isCellSelection(selection)) {
    return false;
  }

  let cellCount = 0;
  const table = findParentNodeClosestToPos(selection.ranges[0]!.$from, (node) => {
    return node.type.name === "table";
  });

  table?.node.descendants((node) => {
    if (node.type.name === "table") {
      return false;
    }

    if (["tableCell", "tableHeader"].includes(node.type.name)) {
      cellCount += 1;
    }
  });

  const allCellsSelected = cellCount === selection.ranges.length;

  if (!allCellsSelected) {
    return false;
  }

  editor.commands.deleteTable();

  return true;
};