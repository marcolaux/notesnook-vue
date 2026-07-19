import { InboxItemHistory } from "../types.js";
import Database from "../api/index.js";
import { ICollection } from "./collection.js";
import { SQLCollection } from "../database/sql-collection.js";
export declare class InboxItemsHistory implements ICollection {
    private readonly db;
    name: string;
    readonly collection: SQLCollection<"inboxitemshistory", InboxItemHistory>;
    constructor(db: Database);
    init(): Promise<void>;
    add(item: {
        id: string;
        status: "failed" | "success";
        source?: string;
        errorContext?: string;
    }): Promise<string>;
    get failed(): import("../database/sql-collection.js").FilteredSelector<InboxItemHistory>;
    delete(ids: string[]): Promise<void>;
    deleteFailed(): Promise<void>;
    exists(id: string): Promise<boolean>;
}
