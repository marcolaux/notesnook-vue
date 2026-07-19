import { ICollection } from "./collection.js";
import { ContentItem, ContentType, UnencryptedContentItem, NoteContent } from "../types.js";
import Database from "../api/index.js";
import { SQLCollection } from "../database/sql-collection.js";
export declare const EMPTY_CONTENT: (noteId: string) => UnencryptedContentItem;
export declare class Content implements ICollection {
    private readonly db;
    name: string;
    readonly collection: SQLCollection<"content", ContentItem>;
    constructor(db: Database);
    init(): Promise<void>;
    /**
     * Required to satisfy the ICollection interface.
     * This collection does not currently maintain a local cache that needs invalidation,
     * but the method must exist for type safety when iterating over all collections.
     */
    invalidateCache(): void;
    add(content: Partial<ContentItem>): Promise<string | undefined>;
    get(id: string): Promise<import("../types.js").EncryptedContentItem | UnencryptedContentItem | undefined>;
    remove(...ids: string[]): Promise<void>;
    removeByNoteId(...ids: string[]): Promise<void>;
    updateByNoteId(partial: Partial<ContentItem>, ...ids: string[]): Promise<void>;
    findByNoteId(noteId: string): Promise<ContentItem | undefined>;
    exists(id: string): Promise<boolean>;
    downloadMedia(groupId: string, contentItem: {
        type: ContentType;
        data: string;
    }, notify?: boolean): Promise<{
        type: ContentType;
        data: string;
    }>;
    removeAttachments(id: string, hashes: string[]): Promise<void>;
    preProcess(content: NoteContent<false>): Promise<boolean>;
    postProcess(contentItem: NoteContent<false> & {
        noteId: string;
    }): Promise<string>;
    private processLinkedAttachments;
    private processInternalLinks;
}
