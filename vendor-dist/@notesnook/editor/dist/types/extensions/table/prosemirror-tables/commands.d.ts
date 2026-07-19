import { Node, NodeType } from "prosemirror-model";
import { Command, EditorState, Transaction } from "prosemirror-state";
import type { Direction } from "./input.js";
import { Rect, TableMap } from "./tablemap.js";
/**
 * @public
 */
export type TableRect = Rect & {
    tableStart: number;
    map: TableMap;
    table: Node;
};
/**
 * Helper to get the selected rectangle in a table, if any. Adds table
 * map, table node, and table start offset to the object for
 * convenience.
 *
 * @public
 */
export declare function selectedRect(state: EditorState): TableRect;
/**
 * Add a column at the given position in a table.
 *
 * @public
 */
export declare function addColumn(tr: Transaction, { map, tableStart, table }: TableRect, col: number, defaultCellAttrs?: {
    colwidth?: number[];
}): Transaction;
/**
 * Command to add a column before the column with the selection.
 *
 * @public
 */
export declare function addColumnBefore(state: EditorState, dispatch?: (tr: Transaction) => void, defaultCellAttrs?: {
    colwidth?: number[];
}): boolean;
/**
 * Command to add a column after the column with the selection.
 *
 * @public
 */
export declare function addColumnAfter(state: EditorState, dispatch?: (tr: Transaction) => void, defaultCellAttrs?: {
    colwidth?: number[];
}): boolean;
/**
 * @public
 */
export declare function removeColumn(tr: Transaction, { map, table, tableStart }: TableRect, col: number): void;
/**
 * Command function that removes the selected columns from a table.
 *
 * @public
 */
export declare function deleteColumn(state: EditorState, dispatch?: (tr: Transaction) => void): boolean;
/**
 * @public
 */
export declare function rowIsHeader(map: TableMap, table: Node, row: number): boolean;
/**
 * @public
 */
export declare function addRow(tr: Transaction, { map, tableStart, table }: TableRect, row: number, defaultCellAttrs?: {
    colwidth?: number[];
}): Transaction;
/**
 * Add a table row before the selection.
 *
 * @public
 */
export declare function addRowBefore(state: EditorState, dispatch?: (tr: Transaction) => void, defaultCellAttrs?: {
    colwidth?: number[];
}): boolean;
/**
 * Add a table row after the selection.
 *
 * @public
 */
export declare function addRowAfter(state: EditorState, dispatch?: (tr: Transaction) => void, defaultCellAttrs?: {
    colwidth?: number[];
}): boolean;
/**
 * @public
 */
export declare function removeRow(tr: Transaction, { map, table, tableStart }: TableRect, row: number): void;
/**
 * Remove the selected rows from a table.
 *
 * @public
 */
export declare function deleteRow(state: EditorState, dispatch?: (tr: Transaction) => void): boolean;
/**
 * Merge the selected cells into a single cell. Only available when
 * the selected cells' outline forms a rectangle.
 *
 * @public
 */
export declare function mergeCells(state: EditorState, dispatch?: (tr: Transaction) => void): boolean;
/**
 * Split a selected cell, whose rowpan or colspan is greater than one,
 * into smaller cells. Use the first cell type for the new cells.
 *
 * @public
 */
export declare function splitCell(state: EditorState, dispatch?: (tr: Transaction) => void): boolean;
/**
 * @public
 */
export interface GetCellTypeOptions {
    node: Node;
    row: number;
    col: number;
}
/**
 * Split a selected cell, whose rowpan or colspan is greater than one,
 * into smaller cells with the cell type (th, td) returned by getType function.
 *
 * @public
 */
export declare function splitCellWithType(getCellType: (options: GetCellTypeOptions) => NodeType): Command;
/**
 * Returns a command that sets the given attribute to the given value,
 * and is only available when the currently selected cell doesn't
 * already have that attribute set to that value.
 *
 * @public
 */
export declare function setCellAttr(name: string, value: unknown): Command;
/**
 * @public
 */
export type ToggleHeaderType = "column" | "row" | "cell";
/**
 * Toggles between row/column header and normal cells (Only applies to first row/column).
 * For deprecated behavior pass `useDeprecatedLogic` in options with true.
 *
 * @public
 */
export declare function toggleHeader(type: ToggleHeaderType, options?: {
    useDeprecatedLogic: boolean;
} | undefined): Command;
/**
 * Toggles whether the selected row contains header cells.
 *
 * @public
 */
export declare const toggleHeaderRow: Command;
/**
 * Toggles whether the selected column contains header cells.
 *
 * @public
 */
export declare const toggleHeaderColumn: Command;
/**
 * Toggles whether the selected cells are header cells.
 *
 * @public
 */
export declare const toggleHeaderCell: Command;
/**
 * Returns a command for selecting the next (direction=1) or previous
 * (direction=-1) cell in a table.
 *
 * @public
 */
export declare function goToNextCell(direction: Direction): Command;
/**
 * Deletes the table around the selection, if any.
 *
 * @public
 */
export declare function deleteTable(state: EditorState, dispatch?: (tr: Transaction) => void): boolean;
/**
 * Deletes the content of the selected cells, if they are not empty.
 *
 * @public
 */
export declare function deleteCellSelection(state: EditorState, dispatch?: (tr: Transaction) => void): boolean;
/**
 * Options for moveTableRow
 *
 * @public
 */
export interface MoveTableRowOptions {
    /**
     * The source row index to move from.
     */
    from: number;
    /**
     * The destination row index to move to.
     */
    to: number;
    /**
     * Whether to select the moved row after the operation.
     *
     * @default true
     */
    select?: boolean;
    /**
     * Optional position to resolve table from. If not provided, uses the current selection.
     */
    pos?: number;
}
/**
 * Move a table row from index `from` to index `to`.
 *
 * @public
 */
export declare function moveTableRow(options: MoveTableRowOptions): Command;
/**
 * Options for moveTableColumn
 *
 * @public
 */
export interface MoveTableColumnOptions {
    /**
     * The source column index to move from.
     */
    from: number;
    /**
     * The destination column index to move to.
     */
    to: number;
    /**
     * Whether to select the moved column after the operation.
     *
     * @default true
     */
    select?: boolean;
    /**
     * Optional position to resolve table from. If not provided, uses the current selection.
     */
    pos?: number;
}
/**
 * Move a table column from index `from` to index `to`.
 *
 * @public
 */
export declare function moveTableColumn(options: MoveTableColumnOptions): Command;
