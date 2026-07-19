import { StorageAccessor } from "../interfaces.js";
import { MaybeDeletedItem } from "../types.js";
export default class Indexer<T> {
    private readonly storage;
    private readonly type;
    private _indices;
    constructor(storage: StorageAccessor, type: string);
    init(): Promise<void>;
    exists(key: string): boolean;
    index(key: string): Promise<void>;
    get indices(): string[];
    deindex(key: string): Promise<void>;
    clear(): Promise<void>;
    read(key: string, isArray?: boolean): Promise<MaybeDeletedItem<T> | undefined>;
    write(key: string, data: MaybeDeletedItem<T>): Promise<void>;
    remove(key: string): Promise<void>;
    readMulti(keys: string[]): Promise<[string, MaybeDeletedItem<T>][]>;
    /**
     *
     * @param {any[]} items
     * @returns
     */
    writeMulti(items: [string, MaybeDeletedItem<T>][]): Promise<void>;
    migrateIndices(): Promise<void>;
    private makeId;
}
