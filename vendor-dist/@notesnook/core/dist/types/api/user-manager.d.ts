import { User } from "../types.js";
import Database from "./index.js";
import { SerializedKeyPair, SerializedKey } from "@notesnook/crypto";
import { KeyVersion } from "./sync/types.js";
declare class UserManager {
    private readonly db;
    private tokenManager;
    private keyManager;
    constructor(db: Database);
    init(): Promise<void>;
    signup(email: string, password: string): Promise<void>;
    authenticateEmail(email: string): Promise<any>;
    authenticateMultiFactorCode(code: string, method: string): Promise<boolean>;
    authenticatePassword(email: string, password: string, hashedPassword?: string, sessionExpired?: boolean): Promise<void>;
    getSessions(): Promise<void>;
    clearSessions(all?: boolean): Promise<void>;
    activateTrial(): Promise<boolean>;
    logout(revoke?: boolean, reason?: string): Promise<void>;
    setUser(user: User): Promise<void>;
    getUser(): Promise<User | undefined>;
    /**
     * @deprecated
     */
    getLegacyUser(): Promise<User | undefined>;
    resetUser(removeAttachments?: boolean): Promise<true | undefined>;
    private updateUser;
    deleteUser(password: string): Promise<true | undefined>;
    fetchUser(): Promise<User | undefined>;
    changePassword(oldPassword: string, newPassword: string): Promise<boolean>;
    changeMarketingConsent(enabled: boolean): Promise<void>;
    resetPassword(newPassword: string): Promise<boolean>;
    getDataEncryptionKeys(): Promise<{
        version: KeyVersion;
        key: SerializedKey;
    }[] | undefined>;
    getMasterKey(): Promise<SerializedKey | undefined>;
    /**
     * @deprecated
     */
    getLegacyEncryptionKey(): Promise<SerializedKey | undefined>;
    private getUserKey;
    getAttachmentsKey(): Promise<SerializedKey | undefined>;
    getMonographPasswordsKey(): Promise<SerializedKey | undefined>;
    getInboxKeys(): Promise<SerializedKeyPair | undefined>;
    hasInboxKeys(): Promise<boolean>;
    discardInboxKeys(): Promise<void>;
    saveInboxKeys(keys: SerializedKeyPair): Promise<void>;
    sendVerificationEmail(newEmail?: string): Promise<void>;
    changeEmail(newEmail: string, password: string, code: string): Promise<void>;
    recoverAccount(email: string): Promise<any>;
    verifyPassword(password: string): Promise<boolean>;
    _updatePassword(type: "change" | "reset", data: {
        new_password: string;
        old_password?: string;
        encryptionKey?: SerializedKey;
    }): Promise<boolean>;
    private usesFallbackPWHash;
}
export default UserManager;
