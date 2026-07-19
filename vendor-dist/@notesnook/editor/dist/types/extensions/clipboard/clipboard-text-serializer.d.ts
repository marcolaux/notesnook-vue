import { Schema, Slice } from "prosemirror-model";
import { EditorView } from "@tiptap/pm/view";
export declare function clipboardTextSerializer(content: Slice, view: EditorView): string;
export declare function getTextBetween(slice: Slice, schema: Schema): string;
