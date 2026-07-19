import type { ResolvedPos } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
export type CellSelectionRange = {
    $anchor: ResolvedPos;
    $head: ResolvedPos;
    indexes: number[];
};
/**
 * Returns a range of rectangular selection spanning all merged cells around a
 * column at index `columnIndex`.
 *
 * Original implementation from Atlassian (Apache License 2.0)
 *
 * https://bitbucket.org/atlassian/atlassian-frontend-mirror/src/5f91cb871e8248bc3bae5ddc30bb9fd9200fadbb/editor/editor-tables/src/utils/get-selection-range-in-column.ts#editor/editor-tables/src/utils/get-selection-range-in-column.ts
 *
 * @internal
 */
export declare function getSelectionRangeInColumn(tr: Transaction, startColIndex: number, endColIndex?: number): CellSelectionRange | undefined;
/**
 * Returns a range of rectangular selection spanning all merged cells around a
 * row at index `rowIndex`.
 *
 * Original implementation from Atlassian (Apache License 2.0)
 *
 * https://bitbucket.org/atlassian/atlassian-frontend-mirror/src/5f91cb871e8248bc3bae5ddc30bb9fd9200fadbb/editor/editor-tables/src/utils/get-selection-range-in-row.ts#editor/editor-tables/src/utils/get-selection-range-in-row.ts
 *
 * @internal
 */
export declare function getSelectionRangeInRow(tr: Transaction, startRowIndex: number, endRowIndex?: number): CellSelectionRange | undefined;
