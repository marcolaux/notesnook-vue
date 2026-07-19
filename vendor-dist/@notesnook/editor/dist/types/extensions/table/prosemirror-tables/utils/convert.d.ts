import type { Node } from "prosemirror-model";
/**
 * This function will transform the table node into a matrix of rows and columns
 * respecting merged cells, for example this table:
 *
 * ```
 * ┌──────┬──────┬─────────────┐
 * │  A1  │  B1  │     C1      │
 * ├──────┼──────┴──────┬──────┤
 * │  A2  │     B2      │      │
 * ├──────┼─────────────┤  D1  │
 * │  A3  │  B3  │  C3  │      │
 * └──────┴──────┴──────┴──────┘
 * ```
 *
 * will be converted to the below:
 *
 * ```javascript
 * [
 *   [A1, B1, C1, null],
 *   [A2, B2, null, D1],
 *   [A3, B3, C3, null],
 * ]
 * ```
 * @internal
 */
export declare function convertTableNodeToArrayOfRows(tableNode: Node): (Node | null)[][];
/**
 * Convert an array of rows to a table node.
 *
 * @internal
 */
export declare function convertArrayOfRowsToTableNode(tableNode: Node, arrayOfNodes: (Node | null)[][]): Node;
