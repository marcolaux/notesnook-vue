import { Transaction } from "@tiptap/pm/state";
import { Node as ProsemirrorNode } from "prosemirror-model";
export declare function countCheckedItems(node: ProsemirrorNode): {
    checked: number;
    total: number;
};
export declare function deleteCheckedItems(tr: Transaction, pos: number): Transaction | null | undefined;
export declare function sortList(tr: Transaction, pos: number): Transaction | null | undefined;
export declare function findRootTaskList(doc: ProsemirrorNode, pos?: number): import("../../utils/prosemirror.js").NodeWithPosAndDepth | undefined;
export declare function toggleChildren(tr: Transaction, node: ProsemirrorNode, toggleState: boolean, parentPos: number): number;
