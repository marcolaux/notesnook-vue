import { Node } from "@tiptap/core";
export interface ParagraphOptions {
    HTMLAttributes: Record<string, unknown>;
    doubleSpaced: boolean;
}
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        paragraph: {
            /**
             * Toggle a paragraph
             */
            setParagraph: () => ReturnType;
        };
    }
}
export declare const Paragraph: Node<ParagraphOptions, any>;
