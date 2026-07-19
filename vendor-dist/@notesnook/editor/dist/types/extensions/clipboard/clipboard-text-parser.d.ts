import { ResolvedPos, Slice } from "@tiptap/pm/model";
import { EditorView } from "@tiptap/pm/view";
export declare function clipboardTextParser(text: string, $context: ResolvedPos, plain: boolean, view: EditorView): Slice;
export declare function convertTextToHTML(src: string): string;
export declare function isProbablyMarkdown(text: string, debug?: boolean): boolean;
