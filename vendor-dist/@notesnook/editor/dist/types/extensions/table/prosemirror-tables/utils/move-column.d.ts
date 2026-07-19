import type { Transaction } from "prosemirror-state";
/**
 * Parameters for moving a column in a table.
 *
 * @internal
 */
export interface MoveColumnParams {
    tr: Transaction;
    originIndex: number;
    targetIndex: number;
    select: boolean;
    pos: number;
}
/**
 * Move a column from index `origin` to index `target`.
 *
 * @internal
 */
export declare function moveColumn(moveColParams: MoveColumnParams): boolean;
