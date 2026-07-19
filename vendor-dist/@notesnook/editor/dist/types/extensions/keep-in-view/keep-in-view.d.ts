import { Editor, Extension } from "@tiptap/core";
type KeepInViewOptions = {
    scrollIntoViewOnWindowResize: boolean;
};
export declare const KeepInView: Extension<KeepInViewOptions, {
    onWindowResize?: ((this: Window, ev: UIEvent) => void) | undefined;
}>;
export declare function keepLastLineInView(editor: Editor, THRESHOLD?: number, SCROLL_THRESHOLD?: number): void;
export {};
