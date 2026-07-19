import { ReactNodeViewProps } from "../react/index.js";
import { Node as ProsemirrorNode } from "prosemirror-model";
import { Editor as TiptapEditor } from "@tiptap/core";
import { EditorView, NodeView } from "prosemirror-view";
export declare function TableComponent(props: ReactNodeViewProps & {
    cellMinWidth: number;
}): import("react/jsx-runtime").JSX.Element;
export declare function TableNodeView(editor: TiptapEditor): new (node: ProsemirrorNode, cellMinWidth: number, view: EditorView) => NodeView;
