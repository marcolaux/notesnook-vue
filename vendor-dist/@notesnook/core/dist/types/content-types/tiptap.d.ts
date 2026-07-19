import { ContentBlock } from "../types.js";
import { InternalLink } from "../utils/internal-link.js";
export type ResolveHashes = (hashes: string[]) => Promise<Record<string, string>>;
export type ResolveAttachments = (attachments: Record<string, Record<string, string>>) => Promise<Record<string, string | false | undefined>>;
export type ResolveInternalLink = (link: string) => string;
declare const ExtractableTypes: readonly ["blocks", "internalLinks", "blocksWithLink"];
type ExtractableType = (typeof ExtractableTypes)[number];
type ExtractionResult = {
    blocks: ContentBlock[];
    internalLinks: InternalLink[];
};
export declare class Tiptap {
    private data;
    constructor(data: string);
    toHTML(): string;
    toTXT(): string;
    toMD(): string;
    toHeadline(): string;
    toTitle(): string;
    search(query: string): boolean;
    insertBlockIds(): string;
    insertMedia(resolve: ResolveHashes): Promise<string>;
    resolveAttachments(resolve: ResolveAttachments): Promise<this>;
    resolveInternalLinks(resolve: ResolveInternalLink): this;
    extract(...types: ExtractableType[]): ExtractionResult;
    /**
     * @param {string[]} hashes
     * @returns
     */
    removeAttachments(hashes: string[]): string;
    postProcess(saveAttachment: (data: string, mime: string, filename?: string) => Promise<string | undefined>): Promise<{
        data: string;
        hashes: string[];
        internalLinks: InternalLink[];
    }>;
}
export {};
