import { Extension, Editor } from "@tiptap/core";
import "@tiptap/extension-text-style";
export type TextDirections = undefined | "rtl";
type TextDirectionOptions = {
    types: string[];
    defaultDirection: TextDirections;
};
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        textDirection: {
            /**
             * Set the font family
             */
            setTextDirection: (direction: TextDirections) => ReturnType;
        };
    }
}
export declare function getTextDirection(editor: Editor): TextDirections;
export declare const TextDirection: Extension<TextDirectionOptions, any>;
export {};
