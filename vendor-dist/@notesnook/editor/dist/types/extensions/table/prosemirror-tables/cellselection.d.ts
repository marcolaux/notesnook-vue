import { Node, ResolvedPos, Slice } from "prosemirror-model";
import { EditorState, Selection, Transaction } from "prosemirror-state";
import { DecorationSource } from "prosemirror-view";
import { Mappable } from "prosemirror-transform";
/**
 * @public
 */
export interface CellSelectionJSON {
    type: string;
    anchor: number;
    head: number;
}
/**
 * A [`Selection`](http://prosemirror.net/docs/ref/#state.Selection)
 * subclass that represents a cell selection spanning part of a table.
 * With the plugin enabled, these will be created when the user
 * selects across cells, and will be drawn by giving selected cells a
 * `selectedCell` CSS class.
 *
 * @public
 */
export declare class CellSelection extends Selection {
    $anchorCell: ResolvedPos;
    $headCell: ResolvedPos;
    constructor($anchorCell: ResolvedPos, $headCell?: ResolvedPos);
    map(doc: Node, mapping: Mappable): CellSelection | Selection;
    content(): Slice;
    replace(tr: Transaction, content?: Slice): void;
    replaceWith(tr: Transaction, node: Node): void;
    forEachCell(f: (node: Node, pos: number) => void): void;
    isColSelection(): boolean;
    static colSelection($anchorCell: ResolvedPos, $headCell?: ResolvedPos): CellSelection;
    isRowSelection(): boolean;
    eq(other: unknown): boolean;
    static rowSelection($anchorCell: ResolvedPos, $headCell?: ResolvedPos): CellSelection;
    toJSON(): CellSelectionJSON;
    static fromJSON(doc: Node, json: CellSelectionJSON): CellSelection;
    static create(doc: Node, anchorCell: number, headCell?: number): CellSelection;
    getBookmark(): CellBookmark;
}
/**
 * @public
 */
export declare class CellBookmark {
    anchor: number;
    head: number;
    constructor(anchor: number, head: number);
    map(mapping: Mappable): CellBookmark;
    resolve(doc: Node): CellSelection | Selection;
}
export declare function drawCellSelection(state: EditorState): DecorationSource | null;
export declare function normalizeSelection(state: EditorState, tr: Transaction | undefined, oldState: EditorState, allowTableNodeSelection: boolean): Transaction | undefined;
