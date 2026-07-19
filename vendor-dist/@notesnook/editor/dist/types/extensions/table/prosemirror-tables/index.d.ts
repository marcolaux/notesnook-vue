import { Plugin } from "prosemirror-state";
/**
 * @public
 */
export type TableEditingOptions = {
    /**
     * Whether to allow table node selection.
     *
     * By default, any node selection wrapping a table will be converted into a
     * CellSelection wrapping all cells in the table. You can pass `true` to allow
     * the selection to remain a NodeSelection.
     *
     * @default false
     */
    allowTableNodeSelection?: boolean;
};
/**
 * Creates a [plugin](http://prosemirror.net/docs/ref/#state.Plugin)
 * that, when added to an editor, enables cell-selection, handles
 * cell-based copy/paste, and makes sure tables stay well-formed (each
 * row has the same width, and cells don't overlap).
 *
 * You should probably put this plugin near the end of your array of
 * plugins, since it handles mouse and arrow key events in tables
 * rather broadly, and other plugins, like the gap cursor or the
 * column-width dragging plugin, might want to get a turn first to
 * perform more specific behavior.
 *
 * @public
 */
export declare function tableEditing({ allowTableNodeSelection }?: TableEditingOptions): Plugin;
