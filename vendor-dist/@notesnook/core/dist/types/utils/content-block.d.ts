import { ContentBlock } from "../types.js";
import { InternalLinkWithOffset } from "./internal-link.js";
export declare function extractInternalLinks(block: ContentBlock): InternalLinkWithOffset[];
export type TextSlice = {
    text: string;
    highlighted: boolean;
};
export declare function highlightInternalLinks(block: ContentBlock, noteId: string): [TextSlice, TextSlice, TextSlice][];
export declare function ellipsize(text: string, maxLength: number, from: "start" | "end"): string;
