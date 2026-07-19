import { Extension } from "@tiptap/core";
import { Slice } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
export declare const Clipboard: Extension<any, any>;
export declare function transformCopied(slice: Slice, view: EditorView): any;
