import type { Node, ResolvedPos } from "prosemirror-model";
import type { Selection } from "prosemirror-state";
/**
 * Find the closest table node for a given position.
 *
 * @public
 */
export declare function findTable($pos: ResolvedPos): FindNodeResult | null;
/**
 * Try to find the anchor and head cell in the same table by using the given
 * anchor and head as hit points, or fallback to the selection's anchor and
 * head.
 *
 * @public
 */
export declare function findCellRange(selection: Selection, anchorHit?: number, headHit?: number): [ResolvedPos, ResolvedPos] | null;
/**
 * Try to find a resolved pos of a cell by using the given pos as a hit point.
 *
 * @public
 */
export declare function findCellPos(doc: Node, pos: number): ResolvedPos | undefined;
/**
 * Result of finding a parent node.
 *
 * @public
 */
export interface FindNodeResult {
    /**
     * The closest parent node that satisfies the predicate.
     */
    node: Node;
    /**
     * The position directly before the node.
     */
    pos: number;
    /**
     * The position at the start of the node.
     */
    start: number;
    /**
     * The depth of the node.
     */
    depth: number;
}
