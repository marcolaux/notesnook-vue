import type { Selection } from "prosemirror-state";
import { FindNodeResult } from "./query.js";
/**
 * Returns an array of cells in a column at the specified column index.
 *
 * @internal
 */
export declare function getCellsInColumn(columnIndex: number, selection: Selection): FindNodeResult[] | undefined;
/**
 * Returns an array of cells in a row at the specified row index.
 *
 * @internal
 */
export declare function getCellsInRow(rowIndex: number, selection: Selection): FindNodeResult[] | undefined;
