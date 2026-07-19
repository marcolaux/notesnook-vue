import Database from "../api/index.js";
import { GroupOptions, TrashItem } from "../types.js";
import { VirtualizedGrouping } from "../utils/virtualized-grouping.js";
export default class Trash {
    private readonly db;
    collections: readonly ["notes", "notebooks"];
    cache: {
        notes: string[];
        notebooks: string[];
    };
    private userDeletedCache;
    constructor(db: Database);
    init(): Promise<void>;
    buildCache(): Promise<void>;
    cleanup(): Promise<void>;
    add(type: "note" | "notebook", ids: string[], deletedBy?: TrashItem["deletedBy"]): Promise<void>;
    delete(...ids: string[]): Promise<void>;
    private _delete;
    restore(...ids: string[]): Promise<void>;
    clear(): Promise<void>;
    all(deletedBy?: TrashItem["deletedBy"][]): Promise<TrashItem[]>;
    count(): number;
    private trashedNotes;
    private trashedNotebooks;
    grouped(options: GroupOptions): Promise<VirtualizedGrouping<TrashItem>>;
    /**
     *
     * @param {string} id
     */
    exists(id: string): boolean;
    private subNotebooks;
}
