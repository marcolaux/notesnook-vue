import type { Transaction } from "prosemirror-state";
/**
 * Parameters for moving a row in a table.
 *
 * @internal
 */
export interface MoveRowParams {
    tr: Transaction;
    originIndex: number;
    targetIndex: number;
    select: boolean;
    pos: number;
}
/**
 * Move a row from index `origin` to index `target`.
 *
 * @internal
 */
export declare function moveRow(moveRowParams: MoveRowParams): boolean;
