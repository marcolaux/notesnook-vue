/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

... (GPL-3.0 header, see LICENSE) ...

Ported to Vue 3 + TipTap (packages/editor-vue). The row/column move + select
helpers are verbatim from @notesnook/editor (GPL-3.0), table/actions.ts.
CSV export/import (`exportToCSV`/`importCsvToTable`) are intentionally omitted
(they need `file-saver` + `papaparse` + a permission system — deferred to
polish). Import sources changed (`@tiptap/core` → `@tiptap/vue-3`,
`prosemirror-*` → `@tiptap/pm/*`); `!` assertions silence
`noUncheckedIndexedAccess` on `map.map[index]` and the move-cell arrays (the
indices are bounded by the surrounding loop / the `length` equality check).
*/
import type { Editor } from "@tiptap/core";
import { type EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { selectedRect } from "./prosemirror-tables/commands";
import { moveRow } from "./prosemirror-tables/utils/move-row";
import { moveColumn } from "./prosemirror-tables/utils/move-column";

function moveColumnRight(editor: Editor) {
  const { tr } = editor.state;
  const rect = selectedRect(editor.state);
  if (!rect || rect.right >= rect.map.width) return;

  const pos = rect.tableStart + 1;
  const ok = moveColumn({
    tr,
    originIndex: rect.left,
    targetIndex: rect.left + 1,
    select: true,
    pos
  });
  if (ok) {
    editor.view.dispatch(tr);
  }
}

function moveColumnLeft(editor: Editor) {
  const { tr } = editor.state;
  const rect = selectedRect(editor.state);
  if (!rect || rect.left <= 0) return;

  const pos = rect.tableStart + 1;
  const ok = moveColumn({
    tr,
    originIndex: rect.left,
    targetIndex: rect.left - 1,
    select: true,
    pos
  });
  if (ok) {
    editor.view.dispatch(tr);
  }
}

function moveRowDown(editor: Editor) {
  const { tr } = editor.state;
  const rect = selectedRect(editor.state);
  if (!rect || rect.bottom >= rect.map.height) return;

  const pos = rect.tableStart + 1;
  const ok = moveRow({
    tr,
    originIndex: rect.top,
    targetIndex: rect.top + 1,
    select: true,
    pos
  });
  if (ok) {
    editor.view.dispatch(tr);
  }
}

function moveRowUp(editor: Editor) {
  const { tr } = editor.state;
  const rect = selectedRect(editor.state);
  if (!rect || rect.top <= 0) return;

  const pos = rect.tableStart + 1;
  const ok = moveRow({
    tr,
    originIndex: rect.top,
    targetIndex: rect.top - 1,
    select: true,
    pos
  });
  if (ok) {
    editor.view.dispatch(tr);
  }
}

function selectRow(
  tr: Transaction,
  state: EditorState,
  direction: "prev" | "next"
) {
  const rect = selectedRect(state);
  if (!rect) return false;
  const currentCellIndex = rect.map.width * (rect.bottom - 1) + rect.right;
  const nextCellIndex =
    direction === "prev"
      ? currentCellIndex - rect.map.width
      : currentCellIndex + rect.map.width;
  if (nextCellIndex - 1 < 0 || nextCellIndex - 1 >= rect.map.map.length) {
    return false;
  }
  const pos = rect.map.map[nextCellIndex - 1]!;
  tr.setSelection(new TextSelection(tr.doc.resolve(rect.tableStart + pos + 1)));
  tr.scrollIntoView();
  return true;
}

function selectColumn(
  tr: Transaction,
  state: EditorState,
  direction: "prev" | "next"
) {
  const rect = selectedRect(state);
  if (!rect) return false;
  const currentCellIndex = rect.map.width * (rect.bottom - 1) + rect.right;
  const nextCellIndex =
    direction === "prev" ? currentCellIndex - 1 : currentCellIndex + 1;
  if (nextCellIndex - 1 < 0 || nextCellIndex - 1 >= rect.map.map.length) {
    return false;
  }
  const pos = rect.map.map[nextCellIndex - 1]!;
  tr.setSelection(new TextSelection(tr.doc.resolve(rect.tableStart + pos + 1)));
  tr.scrollIntoView();
  return true;
}

export {
  moveColumnLeft,
  moveColumnRight,
  moveRowDown,
  moveRowUp,
  selectRow,
  selectColumn
};