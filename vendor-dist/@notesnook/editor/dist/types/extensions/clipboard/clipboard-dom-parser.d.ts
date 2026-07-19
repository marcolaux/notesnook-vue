import { DOMParser as ProsemirrorDOMParser, ParseOptions } from "@tiptap/pm/model";
import { Node as PMNode, Schema, Slice } from "prosemirror-model";
export declare class ClipboardDOMParser extends ProsemirrorDOMParser {
    static fromSchema(schema: Schema): ClipboardDOMParser;
    parseSlice(dom: Node, options?: ParseOptions | undefined): Slice;
    parse(dom: Node, options?: ParseOptions): PMNode;
}
export declare function removeBlockId(dom: HTMLElement | Document): void;
export declare function cleanupPastedNNLinkHtml(dom: HTMLElement | Document): void;
export declare function formatCodeblocks(dom: HTMLElement | Document): void;
export declare function convertBrToSingleSpacedParagraphs(dom: HTMLElement | Document): void;
export declare function convertGoogleDocsChecklist(dom: HTMLElement | Document): void;
