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
    notebooks: import("../database/index.js").SQLiteItem<TrashOrItem<Notebook>>;
    content: import("../database/index.js").SQLiteItem<import("../types.js").ContentItem>;
    sessioncontent: import("../database/index.js").SQLiteItem<import("../types.js").SessionContentItem>;
    settings: import("../database/index.js").SQLiteItem<import("../types.js").SettingItem<"groupOptions:notebooks" | "groupOptions:trash" | "groupOptions:tags" | "groupOptions:home" | "groupOptions:notes" | "groupOptions:favorites" | "groupOptions:reminders" | "groupOptions:archive" | "groupOptions:search" | "groupOptions:notes:notebooks" | "groupOptions:notes:tags" | "groupOptions:notes:colors" | "toolbarConfig:desktop" | "toolbarConfig:mobile" | "toolbarConfig:tablet" | "toolbarConfig:smallTablet" | "sideBarOrder:routes" | "sideBarOrder:colors" | "sideBarOrder:shortcuts" | "sideBarHiddenItems:routes" | "sideBarHiddenItems:colors" | "trashCleanupInterval" | "titleFormat" | "timeFormat" | "dayFormat" | "weekFormat" | "dateFormat" | "defaultNotebook" | "defaultTag" | "profile" | "vault:lockAfter">>;
    tags: import("../database/index.js").SQLiteItem<import("../types.js").Tag>;
    notes: import("../database/index.js").SQLiteItem<TrashOrItem<import("../types.js").Note>>;
    reminders: import("../database/index.js").SQLiteItem<import("../types.js").Reminder>;
    colors: import("../database/index.js").SQLiteItem<import("../types.js").Color>;
    shortcuts: import("../database/index.js").SQLiteItem<import("../types.js").Shortcut>;
    relations: import("../database/index.js").SQLiteItem<import("../types.js").Relation>;
    attachments: import("../database/index.js").SQLiteItem<import("../types.js").Attachment>;
    notehistory: import("../database/index.js").SQLiteItem<import("../types.js").HistorySession>;
    vaults: import("../database/index.js").SQLiteItem<import("../types.js").Vault>;
    monographs: import("../database/index.js").SQLiteItem<import("../types.js").Monograph>;
    inboxitemshistory: import("../database/index.js").SQLiteItem<import("../types.js").InboxItemHistory>;
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
