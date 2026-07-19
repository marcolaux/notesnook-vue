import { Node } from "@tiptap/core";
export type OutlineListAttributes = {
    collapsed: boolean;
};
export interface OutlineListOptions {
    HTMLAttributes: Record<string, unknown>;
    keepMarks: boolean;
    keepAttributes: boolean;
}
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        outlineList: {
            /**
             * Toggle a bullet list
             */
            toggleOutlineList: () => ReturnType;
        };
    }
}
export declare const OutlineList: Node<OutlineListOptions, any>;
