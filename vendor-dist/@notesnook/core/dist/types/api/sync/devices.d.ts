import { KVStorageAccessor } from "../../interfaces.js";
import TokenManager from "../token-manager.js";
export declare class SyncDevices {
    private readonly kv;
    private readonly tokenManager;
    constructor(kv: KVStorageAccessor, tokenManager: TokenManager);
    register(): Promise<void>;
    unregister(): Promise<void>;
    get(): Promise<string | undefined>;
}
