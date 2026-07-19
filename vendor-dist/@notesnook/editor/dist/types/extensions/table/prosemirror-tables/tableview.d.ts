import { Node } from "prosemirror-model";
import { NodeView } from "prosemirror-view";
/**
 * @public
 */
export declare class TableView implements NodeView {
    node: Node;
    defaultCellMinWidth: number;
    dom: HTMLDivElement;
    table: HTMLTableElement;
    colgroup: HTMLTableColElement;
    contentDOM: HTMLTableSectionElement;
    constructor(node: Node, defaultCellMinWidth: number);
    update(node: Node): boolean;
    ignoreMutation(record: any): boolean;
}
/**
 * @public
 */
export declare function updateColumnsOnResize(node: Node, colgroup: HTMLTableColElement, table: HTMLTableElement, defaultCellMinWidth: number, overrideCol?: number, overrideValue?: number): void;
