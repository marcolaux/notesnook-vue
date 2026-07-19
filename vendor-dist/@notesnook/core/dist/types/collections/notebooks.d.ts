import Database from "../api/index.js";
import { Notebook, TrashOrItem } from "../types.js";
import { ICollection } from "./collection.js";
import { SQLCollection } from "../database/sql-collection.js";
import { DatabaseSchema } from "../database/index.js";
import { Kysely, Transaction } from "@streetwriters/kysely";
export declare class Notebooks implements ICollection {
    private readonly db;
    name: string;
    /**
     * @internal
     */
    collection: SQLCollection<"notebooks", TrashOrItem<Notebook>>;
    constructor(db: Database);
    init(): Promise<void>;
    /**
     * Required to satisfy the ICollection interface.
     * This collection does not currently maintain a local cache that needs invalidation,
     * but the method must exist for type safety when iterating over all collections.
     */
    invalidateCache(): void;
    add(notebookArg: Partial<Notebook>): Promise<string>;
    get all(): import("../database/sql-collection.js").FilteredSelector<Notebook>;
    get pinned(): import("../database/sql-collection.js").FilteredSelector<Notebook>;
    pin(state: boolean, ...ids: string[]): Promise<void>;
    totalNotes(...ids: string[]): Promise<number[]>;
    notes(...ids: string[]): Promise<string[]>;
    get roots(): import("../database/sql-collection.js").FilteredSelector<Notebook>;
    breadcrumbs(id: string): Promise<{
        id: string;
        title: string;
    }[]>;
    notebook(id: string): Promise<Notebook | undefined>;
    find(title: string): Promise<Notebook | undefined>;
    exists(id: string): Promise<boolean>;
    moveToTrash(...ids: string[]): Promise<void>;
    remove(...ids: string[]): Promise<void>;
    parentId(id: string): Promise<string | undefined>;
}
export declare function withSubNotebooks(db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>, ids: string[], excluded: string[]): import("@streetwriters/kysely/dist/cjs/parser/with-parser.js").QueryCreatorWithCommonTableExpression<DatabaseSchema, "subNotebooks(id, path, rootId)", (eb: import("@streetwriters/kysely").QueryCreator<DatabaseSchema & {
    subNotebooks: {
        id: any;
        path: any;
        rootId: any;
    };
}>) => import("@streetwriters/kysely").SelectQueryBuilder<{
    notes: import("../database/index.js").SQLiteItem<TrashOrItem<import("../types.js").Note>>;
    content: import("../database/index.js").SQLiteItem<import("../types.js").ContentItem>;
    relations: import("../database/index.js").SQLiteItem<import("../types.js").Relation>;
    notebooks: import("../database/index.js").SQLiteItem<TrashOrItem<Notebook>>;
    attachments: import("../database/index.js").SQLiteItem<import("../types.js").Attachment>;
    tags: import("../database/index.js").SQLiteItem<import("../types.js").Tag>;
    colors: import("../database/index.js").SQLiteItem<import("../types.js").Color>;
    reminders: import("../database/index.js").SQLiteItem<import("../types.js").Reminder>;
    settings: import("../database/index.js").SQLiteItem<import("../types.js").SettingItem<"groupOptions:notes" | "groupOptions:notebooks" | "groupOptions:tags" | "groupOptions:reminders" | "groupOptions:search" | "groupOptions:trash" | "groupOptions:home" | "groupOptions:favorites" | "groupOptions:archive" | "groupOptions:notes:notebooks" | "groupOptions:notes:tags" | "groupOptions:notes:colors" | "toolbarConfig:desktop" | "toolbarConfig:mobile" | "toolbarConfig:tablet" | "toolbarConfig:smallTablet" | "sideBarOrder:colors" | "sideBarOrder:shortcuts" | "sideBarOrder:routes" | "sideBarHiddenItems:colors" | "sideBarHiddenItems:routes" | "trashCleanupInterval" | "titleFormat" | "timeFormat" | "dayFormat" | "weekFormat" | "dateFormat" | "defaultNotebook" | "defaultTag" | "profile" | "vault:lockAfter">>;
    notehistory: import("../database/index.js").SQLiteItem<import("../types.js").HistorySession>;
    sessioncontent: import("../database/index.js").SQLiteItem<import("../types.js").SessionContentItem>;
    shortcuts: import("../database/index.js").SQLiteItem<import("../types.js").Shortcut>;
    vaults: import("../database/index.js").SQLiteItem<import("../types.js").Vault>;
    monographs: import("../database/index.js").SQLiteItem<import("../types.js").Monograph>;
    subNotebooks: {
        id: any;
        path: any;
        rootId: any;
    };
    roots: {
        id: string;
        path: string;
        rootId: string;
    };
}, "roots", {
    id: string;
    path: string;
    rootId: string;
}>>;
