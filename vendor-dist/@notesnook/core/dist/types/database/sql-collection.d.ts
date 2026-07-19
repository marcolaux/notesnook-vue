import { GroupOptions, Item, MaybeDeletedItem, SortOptions } from "../types.js";
import EventManager from "../utils/event-manager.js";
import { DatabaseAccessor, DatabaseCollection, DatabaseSchema, SQLiteItem } from "./index.js";
import { AnyColumnWithTable, ExpressionOrFactory, Kysely, SelectQueryBuilder, SqlBool } from "@streetwriters/kysely";
import { VirtualizedGrouping } from "../utils/virtualized-grouping.js";
import { Sanitizer } from "./sanitizer.js";
export declare const MAX_SQL_PARAMETERS = 200;
export declare class SQLCollection<TCollectionType extends keyof DatabaseSchema, T extends DatabaseSchema[TCollectionType] = DatabaseSchema[TCollectionType]> implements DatabaseCollection<SQLiteItem<T>, true> {
    private readonly db;
    readonly type: TCollectionType;
    private readonly eventManager;
    private readonly sanitizer;
    constructor(db: DatabaseAccessor, _startTransaction: (executor: (tr: Kysely<DatabaseSchema>) => Promise<void>) => Promise<void>, type: TCollectionType, eventManager: EventManager, sanitizer: Sanitizer);
    clear(): Promise<void>;
    init(): Promise<void>;
    upsert(item: SQLiteItem<T>): Promise<void>;
    softDelete(ids: string[]): Promise<void>;
    delete(ids: string[]): Promise<void>;
    exists(id: string): Promise<boolean>;
    count(): Promise<number>;
    get(id: string): Promise<T | undefined>;
    put(items: (SQLiteItem<T> | undefined)[]): Promise<SQLiteItem<T>[]>;
    update(ids: string[], partial: Partial<SQLiteItem<T>>, options?: {
        sendEvent?: boolean;
        modify?: boolean;
        condition?: ExpressionOrFactory<DatabaseSchema, keyof DatabaseSchema, SqlBool>;
    }): Promise<void>;
    records(ids: string[]): Promise<Record<string, MaybeDeletedItem<T> | undefined>>;
    unsyncedCount(): Promise<number>;
    unsynced(chunkSize: number, forceSync?: boolean): AsyncIterableIterator<MaybeDeletedItem<T>[]>;
    stream(chunkSize: number): AsyncIterableIterator<T>;
    createFilter<T extends Item>(selector: (qb: SelectQueryBuilder<DatabaseSchema, keyof DatabaseSchema, unknown>) => SelectQueryBuilder<DatabaseSchema, keyof DatabaseSchema, unknown>, batchSize?: number): FilteredSelector<T>;
}
export declare class FilteredSelector<T extends Item> {
    readonly type: keyof DatabaseSchema;
    readonly batchSize: number;
    private _fields;
    filter: SelectQueryBuilder<DatabaseSchema, keyof DatabaseSchema, unknown>;
    private _limit;
    constructor(type: keyof DatabaseSchema, filter: SelectQueryBuilder<DatabaseSchema, keyof DatabaseSchema, unknown>, batchSize?: number);
    fields(fields: AnyColumnWithTable<DatabaseSchema, keyof DatabaseSchema>[]): this;
    limit(limit: number): this;
    ids(sortOptions?: SortOptions): Promise<string[]>;
    items(ids?: string[], sortOptions?: SortOptions): Promise<T[]>;
    records(ids?: string[], sortOptions?: SortOptions): Promise<Record<string, T>>;
    has(id: string): Promise<boolean>;
    count(): Promise<number>;
    find(filter: ExpressionOrFactory<DatabaseSchema, keyof DatabaseSchema, SqlBool>): Promise<T | undefined>;
    where(expr: ExpressionOrFactory<DatabaseSchema, keyof DatabaseSchema, SqlBool>): this;
    map<TReturnType>(fn: (item: T) => TReturnType): AsyncIterableIterator<TReturnType>;
    grouped(options: GroupOptions): Promise<VirtualizedGrouping<T>>;
    groups(options: GroupOptions): Promise<{
        index: number;
        group: import("../types.js").GroupHeader;
    }[]>;
    sorted(options: SortOptions): Promise<VirtualizedGrouping<T>>;
    iterate(): {
        [Symbol.asyncIterator](): AsyncGenerator<T, void, unknown>;
    };
    private buildSortExpression;
}
