import { ICollection } from "./collection.js";
import Database from "../api/index.js";
import { NoteContent, SessionContentItem } from "../types.js";
import { SQLCollection } from "../database/sql-collection.js";
export declare class SessionContent implements ICollection {
    private readonly db;
    name: string;
    readonly collection: SQLCollection<"sessioncontent", SessionContentItem>;
    constructor(db: Database);
    init(): Promise<void>;
    add<TLocked extends boolean>(sessionId: string, content: Partial<NoteContent<TLocked>> & {
        title?: string;
        noteId: string;
    }, locked?: TLocked): Promise<void>;
    get(sessionContentId: string): Promise<Partial<NoteContent<boolean> & {
        title: string;
    }> | undefined>;
    remove(sessionContentId: string): Promise<void>;
}
