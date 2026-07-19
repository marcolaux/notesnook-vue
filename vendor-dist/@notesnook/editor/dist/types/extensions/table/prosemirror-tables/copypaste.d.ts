import { Fragment, Node, NodeType, Slice } from "prosemirror-model";
import { EditorState, Transaction } from "prosemirror-state";
import { Rect } from "./tablemap.js";
/**
 * @internal
 */
export type Area = {
    width: number;
    height: number;
    rows: Fragment[];
};
/**
 * Get a rectangular area of cells from a slice, or null if the outer
 * nodes of the slice aren't table cells or rows.
 *
 * @internal
 */
export declare function pastedCells(slice: Slice): Area | null;
export declare function fitSlice(nodeType: NodeType, slice: Slice): Node;
/**
 * Clip or extend (repeat) the given set of cells to cover the given
 * width and height. Will clip rowspan/colspan cells at the edges when
 * they stick out.
 *
 * @internal
 */
export declare function clipCells({ width, height, rows }: Area, newWidth: number, newHeight: number): Area;
/**
 * Insert the given set of cells (as returned by `pastedCells`) into a
 * table, at the position pointed at by rect.
 *
 * @internal
 */
export declare function insertCells(state: EditorState, dispatch: (tr: Transaction) => void, tableStart: number, rect: Rect, cells: Area): void;
