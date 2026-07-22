import { MaybeDeletedItem } from "../types.js";
import EventManager from "../utils/event-manager.js";
import { DatabaseAccessor, DatabaseCollection, DatabaseSchema } from "./index.js";
import { Kysely } from "@streetwriters/kysely";
import { Sanitizer } from "./sanitizer.js";
export declare class SQLCachedCollection<TCollectionType extends keyof DatabaseSchema, T extends DatabaseSchema[TCollectionType] = DatabaseSchema[TCollectionType]> implements DatabaseCollection<T, false> {
    type: TCollectionType;
    private collection;
    private cache;
    constructor(sql: DatabaseAccessor, startTransaction: (executor: (tr: Kysely<DatabaseSchema>) => Promise<void>) => Promise<void>, type: TCollectionType, eventManager: EventManager, sanitizer: Sanitizer);
    init(): Promise<void>;
    clear(): Promise<void>;
    upsert(item: T): Promise<void>;
    delete(ids: string[]): Promise<void>;
    softDelete(ids: string[]): Promise<void>;
    exists(id: string): boolean;
    count(): number;
    get(id: string): T | undefined;
    put(items: (T | undefined)[]): Promise<import("./index.js").SQLiteItem<T>[]>;
    update(ids: string[], partial: Partial<T>): Promise<void>;
    records(ids: string[]): Record<string, MaybeDeletedItem<T> | undefined>;
    items(ids?: string[]): T[];
    unsynced(chunkSize: number): IterableIterator<MaybeDeletedItem<T>[]>;
    stream(): IterableIterator<T>;
    unsyncedCount(): Promise<number>;
}
