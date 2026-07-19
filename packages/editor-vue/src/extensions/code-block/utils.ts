/*
Ported verbatim from @notesnook/editor (GPL-3.0), extensions/code-block/utils.ts.
Pure ProseMirror helpers for code-block line/caret tracking (drives the status
bar "Ln X, Col Y" + the Tab/Shift-Tab indent handlers). Imports adjusted to
`@tiptap/pm/*` and our extension-less module specifiers.
*/
import type { Node } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";
import type { CodeBlockAttributes } from "./code-block";

export type CodeLine = {
  index: number;
  from: number;
  to: number;
  length: number;
  text: (length?: number) => string;
};

export type CaretPosition = {
  column: number;
  line: number;
  selected?: number;
  total: number;
  from: number;
};

export function toCodeLines(code: string, pos: number): CodeLine[] {
  const positions: CodeLine[] = [];

  let start = 0;
  let from = pos + 1;
  let index = 0;
  while (start <= code.length) {
    let end = code.indexOf("\n", start);
    if (end <= -1) end = code.length;

    const lineLength = end - start;
    const to = from + lineLength;
    const lineStart = start;
    positions.push({
      index,
      length: lineLength,
      from,
      to,
      text: (length) => {
        return code.slice(
          lineStart,
          length ? lineStart + length : lineStart + lineLength
        );
      }
    });

    from = to + 1;
    start = end + 1;
    ++index;
  }
  return positions;
}

export function toCaretPosition(
  selection: Selection,
  lines?: CodeLine[]
): CaretPosition | undefined {
  const { $from, $to, $head } = selection;
  if ($from.parent.type.name !== "codeblock") return;
  lines = lines || getLines($from.parent);

  for (const line of lines) {
    if ($head.pos >= line.from && $head.pos <= line.to) {
      const lineLength = line.length + 1;
      return {
        line: line.index + 1,
        column: lineLength - (line.to - $head.pos),
        selected: $to.pos - $from.pos,
        total: lines.length,
        from: line.from
      };
    }
  }
  return;
}

export function getLines(node: Node) {
  const { lines } = node.attrs as CodeBlockAttributes;
  return lines || [];
}