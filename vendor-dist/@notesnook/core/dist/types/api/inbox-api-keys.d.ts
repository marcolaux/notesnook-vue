import { InboxApiKey } from "../types.js";
import TokenManager from "./token-manager.js";
import Database from "./index.js";
export declare class InboxApiKeys {
    private readonly db;
    private readonly tokenManager;
    constructor(db: Database, tokenManager: TokenManager);
    get(): Promise<InboxApiKey[] | undefined>;
    revoke(key: string): Promise<void>;
    create(name: string, expiryDuration: number): Promise<void>;
}
