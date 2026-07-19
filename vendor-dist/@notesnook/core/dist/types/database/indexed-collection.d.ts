import { StorageAccessor } from "../interfaces.js";
import { CollectionType, Collections, ItemMap, MaybeDeletedItem } from "../types.js";
import Indexer from "./indexer.js";
/**
 * @deprecated only kept here for migration purposes
 */
export declare class IndexedCollection<TCollectionType extends CollectionType = CollectionType, T extends ItemMap[Collections[TCollectionType]] = ItemMap[Collections[TCollectionType]]> {
    readonly indexer: Indexer<T>;
    constructor(storage: StorageAccessor, type: TCollectionType);
    clear(): Promise<void>;
    deleteItem(id: string): Promise<void>;
    init(): Promise<void>;
    addItem(item: MaybeDeletedItem<T>): Promise<void>;
    exists(id: string): boolean;
    iterate(chunkSize: number): AsyncGenerator<[string, MaybeDeletedItem<T>][], void, unknown>;
}
