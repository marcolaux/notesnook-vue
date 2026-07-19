import { LazyDatabaseAccessor } from "./index.js";
export declare class ConfigStorage {
    private readonly db;
    constructor(db: LazyDatabaseAccessor);
    getItem(name: string): Promise<unknown | undefined>;
    setItem(name: string, value: unknown): Promise<void>;
    removeItem(name: string): Promise<void>;
    clear(): Promise<void>;
}
