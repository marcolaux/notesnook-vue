import Database from "../api/index.js";
import { SQLCachedCollection } from "../database/sql-cached-collection.js";
import { Notebook, Shortcut, Tag } from "../types.js";
import { ICollection } from "./collection.js";
type ResolveTypeToItem<T extends "notebooks" | "tags" | "all"> = T extends "tags" ? Tag[] : T extends "notebooks" ? Notebook[] : (Tag | Notebook)[];
export declare class Shortcuts implements ICollection {
    private readonly db;
    name: string;
    readonly collection: SQLCachedCollection<"shortcuts", Shortcut>;
    constructor(db: Database);
    init(): Promise<void>;
    add(shortcut: Partial<Shortcut>): Promise<string | undefined>;
    get all(): Shortcut[];
    resolved<T extends "notebooks" | "tags" | "all">(type?: T): Promise<ResolveTypeToItem<T>>;
    exists(id: string): boolean;
    shortcut(id: string): Shortcut | undefined;
    remove(...shortcutIds: string[]): Promise<void>;
}
export {};
