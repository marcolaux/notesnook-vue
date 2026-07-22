import { Tag } from "../types.js";
import Database from "../api/index.js";
import { ICollection } from "./collection.js";
import { SQLCollection } from "../database/sql-collection.js";
export declare class Tags implements ICollection {
    private readonly db;
    name: string;
    readonly collection: SQLCollection<"tags", Tag>;
    constructor(db: Database);
    init(): Promise<void>;
    tag(id: string): Promise<Tag | undefined>;
    find(title: string): Promise<Tag | undefined>;
    add(item: Partial<Tag> & {
        title: string;
    }): Promise<string>;
    get all(): import("../database/sql-collection.js").FilteredSelector<Tag>;
    remove(...ids: string[]): Promise<void>;
    exists(id: string): Promise<boolean>;
}
export declare function sanitizeTag(title: string): string;
