import { Node } from "prosemirror-model";
/**
 * @public
 */
export type ColWidths = number[];
/**
 * @public
 */
export type Problem = {
    type: "colwidth mismatch";
    pos: number;
    colwidth: ColWidths;
} | {
    type: "collision";
    pos: number;
    row: number;
    n: number;
} | {
    type: "missing";
    row: number;
    n: number;
} | {
    type: "overlong_rowspan";
    pos: number;
    n: number;
} | {
    type: "zero_sized";
};
/**
 * @public
 */
export interface Rect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}
/**
 * A table map describes the structure of a given table. To avoid
 * recomputing them all the time, they are cached per table node. To
 * be able to do that, positions saved in the map are relative to the
 * start of the table, rather than the start of the document.
 *
 * @public
 */
export declare class TableMap {
    /**
     * The number of columns
     */
    width: number;
    /**
     * The number of rows
     */
    height: number;
    /**
     * A width * height array with the start position of
     * the cell covering that part of the table in each slot
     */
    map: number[];
    /**
     * An optional array of problems (cell overlap or non-rectangular
     * shape) for the table, used by the table normalizer.
     */
    problems: Problem[] | null;
    constructor(
    /**
     * The number of columns
     */
    width: number, 
    /**
     * The number of rows
     */
    height: number, 
    /**
     * A width * height array with the start position of
     * the cell covering that part of the table in each slot
     */
    map: number[], 
    /**
     * An optional array of problems (cell overlap or non-rectangular
     * shape) for the table, used by the table normalizer.
     */
    problems: Problem[] | null);
    findCell(pos: number): Rect;
    colCount(pos: number): number;
    nextCell(pos: number, axis: "horiz" | "vert", dir: number): null | number;
    rectBetween(a: number, b: number): Rect;
    cellsInRect(rect: Rect): number[];
    positionAt(row: number, col: number, table: Node): number;
    static get(table: Node): TableMap;
}
