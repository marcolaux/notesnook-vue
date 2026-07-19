import { CollectionType, Collections, ItemMap, MaybeDeletedItem } from "../types.js";
import { StorageAccessor } from "../interfaces.js";
/**
 * @deprecated only kept here for migration purposes
 */
export declare class CachedCollection<TCollectionType extends CollectionType, T extends ItemMap[Collections[TCollectionType]]> {
    private collection;
    private cache;
    private cachedItems?;
    constructor(storage: StorageAccessor, type: TCollectionType);
    init(): Promise<void>;
    add(item: MaybeDeletedItem<T>): Promise<void>;
    clear(): Promise<void>;
    exists(id: string): boolean;
    has(id: string): boolean;
    count(): number;
    delete(id: string): Promise<void>;
    items(map?: (item: T) => T | undefined): T[];
    get(id: string): T | undefined;
    invalidateCache(): void;
}
