/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

... (GPL-3.0 header, see LICENSE) ...

Ported to Vue 3 + TipTap (packages/editor-vue). Verbatim from
@notesnook/editor (GPL-3.0), table/utilities/createCell.ts — only the import
source changed (`prosemirror-model` → `@tiptap/pm/model`).
*/
import type {
  Fragment,
  Node as ProsemirrorNode,
  NodeType
} from "@tiptap/pm/model";

export function createCell(
  cellType: NodeType,
  cellContent?: Fragment | ProsemirrorNode | Array<ProsemirrorNode>,
  defaultCellAttrs?: { colwidth?: number[] }
): ProsemirrorNode | null | undefined {
  if (cellContent) {
    return cellType.createChecked(defaultCellAttrs, cellContent);
  }

  return cellType.createAndFill(defaultCellAttrs);
}