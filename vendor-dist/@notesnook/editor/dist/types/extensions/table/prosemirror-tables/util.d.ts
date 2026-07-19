import { EditorState, PluginKey } from "prosemirror-state";
import { Attrs, Node, ResolvedPos } from "prosemirror-model";
import { Rect, TableMap } from "./tablemap.js";
/**
 * @public
 */
export type MutableAttrs = Record<string, unknown>;
/**
 * @public
 */
export interface CellAttrs {
    colspan: number;
    rowspan: number;
    colwidth: number[] | null;
}
/**
 * @public
 */
export declare const tableEditingKey: PluginKey<number>;
/**
 * @public
 */
export declare function cellAround($pos: ResolvedPos): ResolvedPos | null;
export declare function cellWrapping($pos: ResolvedPos): null | Node;
/**
 * @public
 */
export declare function isInTable(state: EditorState): boolean;
/**
 * @internal
 */
export declare function selectionCell(state: EditorState): ResolvedPos;
/**
 * @public
 */
export declare function cellNear($pos: ResolvedPos): ResolvedPos | undefined;
/**
 * @public
 */
export declare function pointsAtCell($pos: ResolvedPos): boolean;
/**
 * @public
 */
export declare function moveCellForward($pos: ResolvedPos): ResolvedPos;
/**
 * @internal
 */
export declare function inSameTable($cellA: ResolvedPos, $cellB: ResolvedPos): boolean;
/**
 * @public
 */
export declare function findCell($pos: ResolvedPos): Rect;
/**
 * @public
 */
export declare function colCount($pos: ResolvedPos): number;
/**
 * @public
 */
export declare function nextCell($pos: ResolvedPos, axis: "horiz" | "vert", dir: number): ResolvedPos | null;
/**
 * @public
 */
export declare function removeColSpan(attrs: CellAttrs, pos: number, n?: number): CellAttrs;
/**
 * @public
 */
export declare function addColSpan(attrs: CellAttrs, pos: number, n?: number): Attrs;
/**
 * @public
 */
export declare function columnIsHeader(map: TableMap, table: Node, col: number): boolean;
export declare function getClientX(event: MouseEvent | TouchEvent): number | null;
export declare function getClientY(event: MouseEvent | TouchEvent): number | null;
export declare function isTouchEvent(event: Event): event is TouchEvent;
