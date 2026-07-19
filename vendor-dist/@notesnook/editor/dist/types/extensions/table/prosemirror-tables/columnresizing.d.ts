import { Node as ProsemirrorNode } from "prosemirror-model";
import { EditorState, Plugin, PluginKey } from "prosemirror-state";
import { DecorationSet, EditorView, NodeView } from "prosemirror-view";
/**
 * @public
 */
export declare const columnResizingPluginKey: PluginKey<ResizeState>;
/**
 * @public
 */
export type ColumnResizingOptions = {
    /**
     * Minimum width of a cell /column. The column cannot be resized smaller than this.
     */
    cellMinWidth?: number;
    /**
     * The default minWidth of a cell / column when it doesn't have an explicit width (i.e.: it has not been resized manually)
     */
    defaultCellMinWidth?: number;
    /**
     * A custom node view for the rendering table nodes. By default, the plugin
     * uses the {@link TableView} class. You can explicitly set this to `null` to
     * not use a custom node view.
     */
    View?: (new (node: ProsemirrorNode, cellMinWidth: number, view: EditorView) => NodeView) | null;
    showResizeHandleOnSelection?: boolean;
};
/**
 * @public
 */
export type Dragging = {
    startX: number;
    startWidth: number;
};
/**
 * @public
 */
export declare function columnResizing({ cellMinWidth, defaultCellMinWidth, View, showResizeHandleOnSelection }?: ColumnResizingOptions): Plugin;
type ResizeState = {
    dragging: Dragging | false;
    decorations: DecorationSet;
};
export declare function createColumnResizeHandles(state: EditorState, activeCellPos: number, resizeState: ResizeState, showResizeHandleOnSelection: boolean): DecorationSet | null;
export {};
