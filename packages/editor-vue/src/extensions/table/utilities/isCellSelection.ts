/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

... (GPL-3.0 header, see LICENSE) ...

Ported to Vue 3 + TipTap (packages/editor-vue). Verbatim from
@notesnook/editor (GPL-3.0), table/utilities/isCellSelection.ts —
`CellSelection` comes from the vendored prosemirror-tables fork.
*/
import { CellSelection } from "../prosemirror-tables/cellselection";

export function isCellSelection(value: unknown): value is CellSelection {
  return value instanceof CellSelection;
}