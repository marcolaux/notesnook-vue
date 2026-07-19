import "@tiptap/extension-text-style";
import { Extension } from "@tiptap/core";
export interface HighlightOptions {
    types: string[];
    HTMLAttributes: Record<string, unknown>;
}
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        highlight: {
            /**
             * Set a highlight mark
             */
            setHighlight: (backgroundColor: string) => ReturnType;
            /**
             * Toggle a highlight mark
             */
            toggleHighlight: (backgroundColor: string) => ReturnType;
            /**
             * Unset a highlight mark
             */
            unsetHighlight: () => ReturnType;
        };
    }
}
export declare const Highlight: Extension<HighlightOptions, any>;
