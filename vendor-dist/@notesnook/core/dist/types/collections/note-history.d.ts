import Database from "../api/index.js";
import { FilteredSelector, SQLCollection } from "../database/sql-collection.js";
import { HistorySession, NoteContent } from "../types.js";
import { ICollection } from "./collection.js";
import { SessionContent } from "./session-content.js";
export declare class NoteHistory implements ICollection {
    private readonly db;
    name: string;
    sessionContent: SessionContent;
    readonly collection: SQLCollection<"notehistory", HistorySession>;
    constructor(db: Database);
    init(): Promise<void>;
    get(noteId: string): FilteredSelector<HistorySession>;
    add(sessionId: string, content: Partial<NoteContent<boolean>> & {
        noteId: string;
        locked?: boolean;
        title?: string;
    }): Promise<string>;
    private cleanup;
    content(sessionId: string): Promise<Partial<NoteContent<boolean> & {
        title: string;
    }> | undefined>;
    session(sessionId: string): Promise<HistorySession | undefined>;
    remove(sessionId: string): Promise<void>;
    clearSessions(...noteIds: string[]): Promise<void>;
    private _remove;
    restore(sessionId: string): Promise<void>;
}
