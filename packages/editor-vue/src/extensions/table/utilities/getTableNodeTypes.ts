/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

... (GPL-3.0 header, see LICENSE) ...

Ported to Vue 3 + TipTap (packages/editor-vue). Verbatim from
@notesnook/editor (GPL-3.0), table/utilities/getTableNodeTypes.ts — import
source changed (`prosemirror-model` → `@tiptap/pm/model`); `!` on
`schema.nodes[type]` silences `noUncheckedIndexedAccess` (the type came from
`Object.keys(schema.nodes)`, so it always exists).
*/
import type { NodeType, Schema } from "@tiptap/pm/model";

export function getTableNodeTypes(schema: Schema): { [key: string]: NodeType } {
  if (schema.cached.tableNodeTypes) {
    return schema.cached.tableNodeTypes;
  }

  const roles: { [key: string]: NodeType } = {};

  Object.keys(schema.nodes).forEach((type) => {
    const nodeType = schema.nodes[type]!;

    if (nodeType.spec.tableRole) {
      roles[nodeType.spec.tableRole] = nodeType;
    }
  });

  schema.cached.tableNodeTypes = roles;

  return roles;
}