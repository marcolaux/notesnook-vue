import { Editor, NodeWithPos, Predicate } from "@tiptap/core";
import { NodeRange, Node as ProsemirrorNode, Mark, NodeType, ResolvedPos, Attrs, Schema, Fragment } from "prosemirror-model";
import { EditorState, Selection, Transaction } from "prosemirror-state";
export type NodeWithOffset = {
    node?: ProsemirrorNode;
    from: number;
    to: number;
};
export declare function hasSameAttributes(prev: Attrs, next: Attrs): boolean;
export declare function findSelectedDOMNode(editor: Editor, types: string[]): HTMLElement | null;
export declare function findSelectedNode(editor: Editor, type: string): ProsemirrorNode | null;
export declare function findMark(node: ProsemirrorNode, type: string): Mark | undefined;
export declare function selectionToOffset(state: EditorState): NodeWithOffset | undefined;
export declare const findChildren: (node: ProsemirrorNode, predicate: Predicate, descend: boolean) => NodeWithPos[];
export declare function findChildrenByType(node: ProsemirrorNode, nodeType: NodeType, descend?: boolean): NodeWithPos[];
export declare const findParentNodeOfTypeClosestToPos: ($pos: ResolvedPos, nodeType: NodeType) => NodeWithPosAndDepth | undefined;
export type NodeWithPosAndDepth = {
    pos: number;
    start: number;
    depth: number;
    node: ProsemirrorNode;
};
type PredicateWithParent = (node: ProsemirrorNode, parent?: ProsemirrorNode) => boolean;
export declare function findParentNodeClosestToPos($pos: ResolvedPos, predicate: PredicateWithParent): NodeWithPosAndDepth | undefined;
export declare function hasParentNode(predicate: Predicate): (selection: Selection) => boolean;
export declare function hasParentNodeOfType(nodeType: NodeType | NodeType[]): (selection: Selection) => boolean;
export declare function findParentNodeOfType(nodeType: NodeType | NodeType[]): (selection: Selection) => {
    pos: number;
    start: number;
    depth: number;
    node: import("prosemirror-model").Node;
} | undefined;
export declare function getParentAttributes(editor: Editor, keepMarks?: boolean, keepAttributes?: boolean): {
    textAlign: any;
    textDirection: any;
};
export declare function getChangedNodeRanges(tr: Transaction): NodeRange[];
interface GetChangedNodesOptions {
    /**
     * Whether to descend into child nodes.
     *
     * @defaultValue false
     */
    descend?: boolean;
    /**
     * A predicate test for node which was found. Return `false` to skip the node.
     *
     * @param node - the node that was found
     * @param pos - the pos of that node
     * @param range - the `NodeRange` which contained this node.
     */
    predicate?: (node: ProsemirrorNode, pos: number, range: NodeRange) => boolean;
}
/**
 * Get all the changed nodes from the provided transaction.
 *
 * The following example will give us all the text nodes in the provided
 * transaction.
 *
 * ```ts
 * import { getChangedNodes } from 'remirror/core';
 *
 * const changedTextNodes = getChangeNodes(tr, { descend: true, predicate: (node) => node.isText });
 * ```
 */
export declare function getChangedNodes(tr: Transaction, options?: GetChangedNodesOptions): NodeWithPos[];
export declare function getExactChangedNodes(tr: Transaction, predicate?: (node: ProsemirrorNode, pos: number, range: NodeRange) => boolean): NodeWithPos[];
export declare function getDeletedNodes(tr: Transaction, predicate: (node: ProsemirrorNode, parent?: ProsemirrorNode) => boolean): NodeWithPos[];
export declare function isClickWithinBounds(e: MouseEvent | TouchEvent, pos: ResolvedPos, hitPosition: "left" | "right", hitArea?: {
    width: number;
    height: number;
}): boolean;
export declare function ensureLeadingParagraph(node: Node, schema: Schema): Fragment;
/**
 * Helper for iterating through the nodes in a document that changed
 * compared to the given previous document. Useful for avoiding
 * duplicate work on each transaction.
 *
 * @public
 */
export declare function changedDescendants(old: ProsemirrorNode, cur: ProsemirrorNode, offset: number, f: (newNode: ProsemirrorNode, pos: number, oldNode?: ProsemirrorNode) => void): void;
export {};
