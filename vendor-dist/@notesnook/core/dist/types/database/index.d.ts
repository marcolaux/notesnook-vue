import { Kysely, KyselyPlugin, PluginTransformQueryArgs, PluginTransformResultArgs, QueryResult, UnknownRow, RootOperationNode, Transaction, ExpressionBuilder, ReferenceExpression, Dialect, MigrationProvider } from "@streetwriters/kysely";
import { Attachment, Color, ContentItem, HistorySession, InboxItemHistory, ItemReference, ItemReferences, ItemType, MaybeDeletedItem, Monograph, Note, Notebook, Relation, Reminder, SessionContentItem, SettingItem, Shortcut, Tag, TrashOrItem, Vault } from "../types.js";
export type SQLiteItem<T> = {
    [P in keyof T]?: T[P] | null;
} & {
    id: string;
};
export type SQLiteItemWithRowID<T> = SQLiteItem<T> & {
    rowid?: number;
};
export interface DatabaseSchema {
    notes: SQLiteItem<TrashOrItem<Note>>;
    content: SQLiteItem<ContentItem>;
    relations: SQLiteItem<Relation>;
    notebooks: SQLiteItem<TrashOrItem<Notebook>>;
    attachments: SQLiteItem<Attachment>;
    tags: SQLiteItem<Tag>;
    colors: SQLiteItem<Color>;
    reminders: SQLiteItem<Reminder>;
    settings: SQLiteItem<SettingItem>;
    notehistory: SQLiteItem<HistorySession>;
    sessioncontent: SQLiteItem<SessionContentItem>;
    shortcuts: SQLiteItem<Shortcut>;
    vaults: SQLiteItem<Vault>;
    monographs: SQLiteItem<Monograph>;
    inboxitemshistory: SQLiteItem<InboxItemHistory>;
}
export type RawDatabaseSchema = DatabaseSchema & {
    kv: {
        key: string;
        value?: string | null;
        dateModified?: number | null;
    };
    config: {
        name: string;
        value?: string | null;
        dateModified?: number | null;
    };
    notes_fts: SQLiteItemWithRowID<{
        notes_fts: string;
        title: string;
        rank: number;
    }>;
    content_fts: SQLiteItemWithRowID<{
        content_fts: string;
        data: string;
        rank: number;
        noteId: string;
    }>;
};
export type DatabaseUpdatedEvent<TCollectionType extends keyof DatabaseSchema = keyof DatabaseSchema> = UpsertEvent<TCollectionType> | DeleteEvent | UpdateEvent<TCollectionType> | UnlinkEvent;
export type UpsertEvent<TCollectionType extends keyof DatabaseSchema = keyof DatabaseSchema> = TCollectionType extends keyof DatabaseSchema ? {
    type: "upsert";
    collection: TCollectionType;
    item: DatabaseSchema[TCollectionType];
} : never;
export type UnlinkEvent = {
    collection: "relations";
    type: "unlink";
    reference: ItemReference | ItemReferences;
    types: ItemType[];
    direction: "from" | "to";
};
export type DeleteEvent = {
    collection: keyof DatabaseSchema;
    type: "softDelete" | "delete";
    ids: string[];
};
export type UpdateEvent<TCollectionType extends keyof DatabaseSchema = keyof DatabaseSchema> = TCollectionType extends keyof DatabaseSchema ? {
    type: "update";
    ids: string[];
    collection: TCollectionType;
    item: Partial<DatabaseSchema[TCollectionType]>;
} : never;
type AsyncOrSyncResult<Async extends boolean, Response> = Async extends true ? Promise<Response> : Response;
export interface DatabaseCollection<T, IsAsync extends boolean> {
    type: keyof DatabaseSchema;
    clear(): Promise<void>;
    init(): Promise<void>;
    upsert(item: T): Promise<void>;
    softDelete(ids: string[]): Promise<void>;
    delete(ids: string[]): Promise<void>;
    exists(id: string): AsyncOrSyncResult<IsAsync, boolean>;
    count(): AsyncOrSyncResult<IsAsync, number>;
    unsyncedCount(): Promise<number>;
    get(id: string): AsyncOrSyncResult<IsAsync, T | undefined>;
    put(items: (T | undefined)[]): Promise<SQLiteItem<T>[]>;
    update(ids: string[], partial: Partial<T>): Promise<void>;
    records(ids: string[]): AsyncOrSyncResult<IsAsync, Record<string, MaybeDeletedItem<T> | undefined>>;
    unsynced(chunkSize: number, forceSync?: boolean): IsAsync extends true ? AsyncIterableIterator<MaybeDeletedItem<T>[]> : IterableIterator<MaybeDeletedItem<T>[]>;
    stream(chunkSize: number): IsAsync extends true ? AsyncIterableIterator<T> : IterableIterator<T>;
}
export type DatabaseAccessor<TSchema = DatabaseSchema> = () => Kysely<TSchema> | Transaction<TSchema>;
export type LazyDatabaseAccessor<TSchema = DatabaseSchema> = Promise<Kysely<TSchema> | Transaction<TSchema>>;
export declare function initializeDatabase<Schema>(db: Kysely<Schema>, migrationProvider: MigrationProvider, name: string): Promise<Kysely<Schema>>;
export type SQLiteOptions = {
    dialect: (name: string, init?: () => Promise<void>) => Dialect;
    journalMode?: "WAL" | "MEMORY" | "OFF" | "PERSIST" | "TRUNCATE" | "DELETE";
    synchronous?: "normal" | "extra" | "full" | "off";
    lockingMode?: "normal" | "exclusive";
    tempStore?: "memory" | "file" | "default";
    cacheSize?: number;
    pageSize?: number;
    password?: string;
    skipInitialization?: boolean;
};
export declare function createDatabase<Schema>(name: string, options: SQLiteOptions & {
    migrationProvider: MigrationProvider;
    onInit?: (db: Kysely<Schema>) => Promise<void>;
}): Promise<Kysely<Schema>>;
export declare function changeDatabasePassword(db: Kysely<DatabaseSchema>, password?: string): Promise<void>;
export declare function isFalse<TB extends keyof DatabaseSchema>(column: ReferenceExpression<DatabaseSchema, TB>): (eb: ExpressionBuilder<DatabaseSchema, TB>) => import("@streetwriters/kysely").ExpressionWrapper<DatabaseSchema, TB, import("@streetwriters/kysely").SqlBool>;
export declare class SqliteBooleanPlugin implements KyselyPlugin {
    #private;
    transformQuery(args: PluginTransformQueryArgs): RootOperationNode;
    transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>>;
}
export {};
