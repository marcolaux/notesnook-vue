import { Extension } from "@tiptap/core";
type FontSizeOptions = {
    types: string[];
};
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        fontSize: {
            /**
             * Set the font family
             */
            setFontSize: (fontSize: string) => ReturnType;
            /**
             * Unset the font family
             */
            unsetFontSize: () => ReturnType;
        };
    }
}
export declare const FontSize: Extension<FontSizeOptions, any>;
export {};
