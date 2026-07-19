import { LazyDatabaseAccessor } from "./index.js";
import { Token } from "../api/token-manager.js";
import { User } from "../types.js";
interface KV {
    v: number;
    lastSynced: number;
    user: User;
    token: Token;
    monographs: string[];
    deviceId: string;
    lastBackupTime: number;
    fullOfflineMode: boolean;
}
export declare const KEYS: (keyof KV)[];
export declare class KVStorage {
    private readonly db;
    constructor(db: LazyDatabaseAccessor);
    read<T extends keyof KV>(key: T): Promise<KV[T] | undefined>;
    write<T extends keyof KV>(key: T, value: KV[T]): Promise<void>;
    delete<T extends keyof KV>(key: T): Promise<void>;
    clear(): Promise<void>;
}
export {};
