import { Editor } from "@tiptap/core";
import { MarkType } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
type ClickHandlerOptions = {
    type: MarkType;
    editor: Editor;
};
export declare function clickHandler(options: ClickHandlerOptions): Plugin;
export {};
