import { NodeSpec, NodeType, Schema } from "prosemirror-model";
import { MutableAttrs } from "./util.js";
/**
 * @public
 */
export type getFromDOM = (dom: HTMLElement) => unknown;
/**
 * @public
 */
export type setDOMAttr = (value: unknown, attrs: MutableAttrs) => void;
/**
 * @public
 */
export interface CellAttributes {
    /**
     * The attribute's default value.
     */
    default: unknown;
    /**
     * A function or type name used to validate values of this attribute.
     *
     * See [validate](https://prosemirror.net/docs/ref/#model.AttributeSpec.validate).
     */
    validate?: string | ((value: unknown) => void);
    /**
     * A function to read the attribute's value from a DOM node.
     */
    getFromDOM?: getFromDOM;
    /**
     * A function to add the attribute's value to an attribute
     * object that's used to render the cell's DOM.
     */
    setDOMAttr?: setDOMAttr;
}
/**
 * @public
 */
export interface TableNodesOptions {
    /**
     * The content expression for table cells.
     */
    cellContent: string;
    /**
     * Additional attributes to add to cells. Maps attribute names to
     * objects with the following properties:
     */
    cellAttributes: {
        [key: string]: CellAttributes;
    };
}
/**
 * @public
 */
export type TableNodes = Record<"table_row" | "table_cell" | "table_header", NodeSpec>;
/**
 * This function creates a set of [node
 * specs](http://prosemirror.net/docs/ref/#model.SchemaSpec.nodes) for
 * `table`, `table_row`, and `table_cell` nodes types as used by this
 * module. The result can then be added to the set of nodes when
 * creating a schema.
 *
 * @public
 */
export declare function tableNodes(options: TableNodesOptions): TableNodes;
/**
 * @public
 */
export type TableRole = "table" | "row" | "cell" | "header_cell";
/**
 * @public
 */
export declare function tableNodeTypes(schema: Schema): Record<TableRole, NodeType>;
