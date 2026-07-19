/*
Ported from @notesnook/editor (GPL-3.0), utils/prosemirror.ts — the subset
needed by the task-list stats plugin + task-item parseHTML. Pure ProseMirror
helpers, framework-agnostic. Types come from `@tiptap/pm/*`; the two TipTap
helpers (`getChangedRanges`) come from `@tiptap/vue-3` (re-export of
`@tiptap/core`) so the editor and extensions share one ProseMirror schema.
*/
import { getChangedRanges } from "@tiptap/vue-3";
import type { NodeWithPos } from "@tiptap/vue-3";
import type { Editor } from "@tiptap/core";
import { DOMParser, Slice } from "@tiptap/pm/model";
import type {
  Fragment,
  Node as ProsemirrorNode,
  NodeRange,
  ResolvedPos,
  Schema
} from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

export type NodeWithPosAndDepth = {
  pos: number;
  start: number;
  depth: number;
  node: ProsemirrorNode;
};

type PredicateWithParent = (node: ProsemirrorNode, parent?: ProsemirrorNode) => boolean;

/** Find the closest parent node (walking up from `$pos`) matching `predicate`. */
export function findParentNodeClosestToPos(
  $pos: ResolvedPos,
  predicate: PredicateWithParent
): NodeWithPosAndDepth | undefined {
  for (let i = $pos.depth; i > 0; i -= 1) {
    const node = $pos.node(i);
    if (predicate(node, i === 1 ? undefined : $pos.node(i - 1))) {
      return { pos: i > 0 ? $pos.before(i) : 0, start: $pos.start(i), depth: i, node };
    }
  }
  return undefined;
}

/** Shallow + deep structural attribute comparison (no nested equality). */
export function hasSameAttributes(prev: Record<string, unknown>, next: Record<string, unknown>): boolean {
  for (const key in prev) {
    if (prev[key] !== next[key]) return false;
  }
  return true;
}

/** Changed block ranges in a transaction (via TipTap's `getChangedRanges`). */
export function getChangedNodeRanges(tr: Transaction): NodeRange[] {
  const nodeRanges: NodeRange[] = [];
  const ranges = getChangedRanges(tr);
  for (const range of ranges) {
    try {
      const $from = tr.doc.resolve(range.newRange.from);
      const $to = tr.doc.resolve(range.newRange.to);
      const nodeRange = $from.blockRange($to);
      if (nodeRange) nodeRanges.push(nodeRange);
    } catch {
      // ignore — matches upstream behaviour
    }
  }
  return nodeRanges;
}

/** Nodes matching `predicate` whose position changed in `tr`. */
export function getExactChangedNodes(
  tr: Transaction,
  predicate?: (node: ProsemirrorNode, pos: number, range: NodeRange) => boolean
): NodeWithPos[] {
  const nodeRange = getChangedNodeRanges(tr);
  const nodes: NodeWithPos[] = [];
  for (const range of nodeRange) {
    const { start } = range;
    if (nodes.every((n) => n.pos !== start)) {
      const node = tr.doc.nodeAt(start);
      if (node && (!predicate || predicate(node, start, range))) {
        nodes.push({ node, pos: start });
      }
    }
  }
  return nodes;
}

/**
 * Ported verbatim from @notesnook/editor (GPL-3.0), utils/prosemirror.ts.
 * All nodes touched by `tr` (optionally descending into children) matching
 * `predicate`. Used by the code-block highlighter to find changed codeblocks.
 */
export interface GetChangedNodesOptions {
  /** Whether to descend into child nodes. @defaultValue false */
  descend?: boolean;
  /** Predicate test; return false to skip a node. */
  predicate?: (node: ProsemirrorNode, pos: number, range: NodeRange) => boolean;
}

export function getChangedNodes(
  tr: Transaction,
  options: GetChangedNodesOptions = {}
): NodeWithPos[] {
  const { descend = false, predicate } = options;
  const nodeRange = getChangedNodeRanges(tr);

  const nodes: NodeWithPos[] = [];
  for (const range of nodeRange) {
    const { start, end } = range;
    tr.doc.nodesBetween(start, end, (node, pos) => {
      const shouldAdd = !predicate || predicate(node, start, range);
      if (shouldAdd && nodes.every((n) => n.pos !== pos)) {
        nodes.push({ node, pos });
      }
      return descend;
    });
  }
  return nodes;
}

/** Parent task-list nodes removed (emptied) by a transaction. */
export function getDeletedNodes(
  tr: Transaction,
  predicate: (node: ProsemirrorNode, parent?: ProsemirrorNode) => boolean
): NodeWithPos[] {
  const nodes: NodeWithPos[] = [];
  for (const step of tr.steps) {
    if (
      "slice" in step &&
      step.slice instanceof Slice &&
      "to" in step &&
      typeof step.to === "number" &&
      "from" in step &&
      typeof step.from === "number" &&
      step.from < tr.doc.nodeSize - 1 &&
      step.slice === Slice.empty
    ) {
      const $from = tr.doc.resolve(step.from);
      const node = findParentNodeClosestToPos($from, predicate);
      if (node) nodes.push(node);
    }
  }
  return nodes;
}

/**
 * Attributes inherited from the current parent when wrapping a selection into
 * a task list (text-align + text-direction + text-style marks/attrs).
 */
export function getParentAttributes(editor: Editor, keepMarks = false, keepAttributes = false): {
  textAlign?: unknown;
  textDirection?: unknown;
  [key: string]: unknown;
} {
  const { textAlign, textDirection } = (editor.state.selection.$from.parent?.attrs || {}) as {
    textAlign?: unknown;
    textDirection?: unknown;
  };
  return {
    ...(keepMarks || keepAttributes ? editor.getAttributes("textStyle") : {}),
    textAlign,
    textDirection
  };
}

/**
 * `parseHTML.getContent` for task items: ensures the imported content begins
 * with a paragraph (matches upstream list-item/task-item content shape).
 * `node` is the DOM element TipTap passes to `getContent`.
 */
export function ensureLeadingParagraph(node: Node, schema: Schema): Fragment {
  const parser = DOMParser.fromSchema(schema);
  const fragment = parser.parse(node).content;
  const firstNode = fragment.firstChild;
  if (firstNode && firstNode.type.name !== "paragraph") {
    const paragraph = schema.nodes.paragraph;
    if (paragraph) return fragment.addToStart(paragraph.create());
  }
  return fragment;
}