import { Note, TrashOrItem, NoteContent } from "../types.js";
import Database from "../api/index.js";
import { ICollection } from "./collection.js";
import { SQLCollection } from "../database/sql-collection.js";
export type ExportOptions = {
    format: "html" | "md" | "txt" | "md-frontmatter";
    contentItem?: NoteContent<false>;
    rawContent?: string;
    disableTemplate?: boolean;
    embedMedia?: boolean;
};
export declare class Notes implements ICollection {
    private readonly db;
    name: string;
    cache: {
        archived: string[];
    };
    /**
     * @internal
     */
    collection: SQLCollection<"notes", TrashOrItem<Note>>;
    totalNotes: number;
    constructor(db: Database);
    init(): Promise<void>;
    buildCache(): Promise<void>;
    invalidateCache(): Promise<void>;
    add(item: Partial<Note & {
        content: NoteContent<false>;
        sessionId: string;
    }>): Promise<string>;
    note(id: string): Promise<Note | undefined>;
    trashed(id: string): Promise<import("../types.js").BaseTrashItem<Note> | undefined>;
    tags(id: string): Promise<import("../types.js").Tag[]>;
    get all(): import("../database/sql-collection.js").FilteredSelector<Note>;
    get exportable(): import("../database/sql-collection.js").FilteredSelector<Note>;
    get pinned(): import("../database/sql-collection.js").FilteredSelector<Note>;
    get conflicted(): import("../database/sql-collection.js").FilteredSelector<Note>;
    get favorites(): import("../database/sql-collection.js").FilteredSelector<Note>;
    get archived(): import("../database/sql-collection.js").FilteredSelector<Note>;
    exists(id: string): Promise<boolean>;
    moveToTrash(...ids: string[]): Promise<void>;
    remove(...ids: string[]): Promise<void>;
    pin(state: boolean, ...ids: string[]): Promise<void>;
    favorite(state: boolean, ...ids: string[]): Promise<void>;
    archive(state: boolean, ...ids: string[]): Promise<void>;
    setExpiryDate(date: number | null, ...ids: string[]): Promise<void>;
    readonly(state: boolean, ...ids: string[]): Promise<void>;
    localOnly(state: boolean, ...ids: string[]): Promise<void>;
    export(id: string, options: ExportOptions): Promise<false | string>;
    export(note: Note, options: ExportOptions): Promise<false | string>;
    duplicate(...ids: string[]): Promise<void>;
    private _delete;
    addToNotebook(notebookId: string, ...noteIds: string[]): Promise<void>;
    removeFromNotebook(notebookId: string, ...noteIds: string[]): Promise<void>;
    removeFromAllNotebooks(...noteIds: string[]): Promise<void>;
    contentBlocks(id: string): Promise<import("../types.js").ContentBlock[]>;
    contentBlocksWithLinks(id: string): Promise<import("../types.js").ContentBlock[]>;
    internalLinks(id: string): Promise<import("../index.js").InternalLink[]>;
    deleteExpiredNotes(): Promise<void>;
}
