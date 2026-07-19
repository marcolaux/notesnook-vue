import { KVStorageAccessor } from "../interfaces.js";
import EventManager from "../utils/event-manager.js";
export type Token = {
    access_token: string;
    t: number;
    expires_in: number;
    scope: string;
    refresh_token: string;
};
type Scope = (typeof SCOPES)[number];
declare const SCOPES: readonly ["notesnook.sync", "offline_access", "IdentityServerApi", "auth:grant_types:mfa", "auth:grant_types:mfa_password"];
declare class TokenManager {
    private readonly storage;
    private readonly eventManager;
    logger: import("@notesnook/logger").ILogger;
    private REFRESH_TOKEN_MUTEX;
    constructor(storage: KVStorageAccessor, eventManager: EventManager);
    getToken(renew?: boolean, forceRenew?: boolean): Promise<Token | undefined>;
    _isTokenExpired(token: Token): boolean;
    _isTokenRefreshable(token: Token): boolean;
    getAccessToken(scopes?: Scope[], forceRenew?: boolean): Promise<string | undefined>;
    _refreshToken(forceRenew?: boolean): Promise<void>;
    revokeToken(): Promise<void>;
    saveToken(tokenResponse: Omit<Token, "t">): Promise<void> | undefined;
    getAccessTokenFromAuthorizationCode(userId: string, authCode: string): Promise<void | undefined>;
}
export default TokenManager;
