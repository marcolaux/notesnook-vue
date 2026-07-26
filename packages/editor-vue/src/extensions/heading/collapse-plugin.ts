import { Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export const headingCollapsePluginKey = new PluginKey("headingCollapse");

export function findCollapsedRanges(doc: ProseMirrorNode): Array<{
  headingPos: number;
  headingNode: ProseMirrorNode;
  from: number;
  to: number;
}> {
  const ranges: Array<{
    headingPos: number;
    headingNode: ProseMirrorNode;
    from: number;
    to: number;
  }> = [];

  doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.attrs.collapsed) {
      const headingLevel = (node.attrs.level as number) || 1;
      const startPos = pos + node.nodeSize;

      const $pos = doc.resolve(pos);
      const parent = $pos.parent;
      const index = $pos.index($pos.depth);

      let currentPos = startPos;
      let endPos = startPos;

      for (let j = index + 1; j < parent.childCount; j++) {
        const sibling = parent.child(j);
        if (sibling.type.name === "heading") {
          const siblingLevel = (sibling.attrs.level as number) || 1;
          if (siblingLevel <= headingLevel) {
            break;
          }
        }
        endPos = currentPos + sibling.nodeSize;
        currentPos += sibling.nodeSize;
      }

      if (endPos > startPos) {
        ranges.push({
          headingPos: pos,
          headingNode: node,
          from: startPos,
          to: endPos
        });
      }
    }
    return true;
  });

  return ranges;
}

export function buildHeadingCollapseDecorations(
  doc: ProseMirrorNode
): DecorationSet {
  const decorations: Decoration[] = [];
  const ranges = findCollapsedRanges(doc);

  for (const range of ranges) {
    // Hide each top-level block node within the collapsed range
    doc.nodesBetween(range.from, range.to, (node, pos) => {
      if (pos >= range.from && pos < range.to && node.isBlock) {
        // Apply decoration to block node
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, {
            class: "heading-collapsed-hidden"
          })
        );
        return false; // Skip children of hidden block
      }
      return true;
    });
  }

  return DecorationSet.create(doc, decorations);
}

export function createHeadingCollapsePlugin(): Plugin {
  return new Plugin({
    key: headingCollapsePluginKey,
    state: {
      init(_, { doc }) {
        return buildHeadingCollapseDecorations(doc);
      },
      apply(tr, oldDecorations, oldState, newState) {
        if (tr.docChanged || tr.selectionSet) {
          return buildHeadingCollapseDecorations(newState.doc);
        }
        return oldDecorations;
      }
    },
    props: {
      decorations(state) {
        return headingCollapsePluginKey.getState(state);
      }
    },
    appendTransaction(transactions, oldState, newState) {
      // Auto-expand parent heading if selection lands inside a collapsed section
      const sel = newState.selection;
      if (!sel || !(sel instanceof Selection)) return null;

      const ranges = findCollapsedRanges(newState.doc);
      const pos = sel.from;

      for (const range of ranges) {
        if (pos >= range.from && pos < range.to) {
          // Uncollapse the heading at range.headingPos
          const tr = newState.tr;
          const headingNode = newState.doc.nodeAt(range.headingPos);
          if (headingNode && headingNode.type.name === "heading") {
            tr.setNodeMarkup(range.headingPos, undefined, {
              ...headingNode.attrs,
              collapsed: false
            });
            return tr;
          }
        }
      }
      return null;
    }
  });
}
