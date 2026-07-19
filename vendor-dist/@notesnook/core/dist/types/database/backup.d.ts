import Migrator from "./migrator.js";
import Database from "../api/index.js";
import { Item, MaybeDeletedItem } from "../types.js";
import { Cipher, SerializedKey } from "@notesnook/crypto";
type BackupDataItem = MaybeDeletedItem<Item> | string[];
type BackupPlatform = "web" | "mobile" | "node";
type BaseBackupFile = {
    version: number;
    type: BackupPlatform;
    date: number;
};
type LegacyUnencryptedBackupFile = BaseBackupFile & {
    data: Record<string, BackupDataItem> | string;
    hash: string;
    hash_type: "md5";
};
type LegacyEncryptedBackupFile = BaseBackupFile & {
    data: Cipher<"base64">;
};
type UnencryptedBackupFile = BaseBackupFile & {
    data: string;
    hash: string;
    hash_type: "md5";
    compressed: true;
    encrypted: false;
};
type EncryptedBackupFile = BaseBackupFile & {
    data: Cipher<"base64">;
    hash: string;
    hash_type: "md5";
    compressed: true;
    encrypted: true;
};
export type BackupFile = UnencryptedBackupFile | EncryptedBackupFile;
export type LegacyBackupFile = LegacyUnencryptedBackupFile | LegacyEncryptedBackupFile;
export default class Backup {
    private readonly db;
    migrator: Migrator;
    constructor(db: Database);
    lastBackupTime(): Promise<number | undefined>;
    updateBackupTime(): Promise<void>;
    /**
     * @deprecated
     */
    exportLegacy(type: BackupPlatform, encrypt?: boolean): AsyncGenerator<{
        type: "file";
        path: string;
        data: string;
    }, void, unknown>;
    export(options: {
        type: BackupPlatform;
        encrypt?: boolean;
        mode?: "full" | "partial";
    }): AsyncGenerator<{
        type: "file";
        path: string;
        data: string;
    } | {
        type: "attachment";
        path: string;
        hash: string;
        total: number;
        current: number;
    }, void, unknown>;
    private backupCollection;
    private bufferToFile;
    import(backup: LegacyBackupFile | BackupFile, options?: {
        password?: string;
        encryptionKey?: string;
        attachmentsKey?: SerializedKey | Cipher<"base64">;
    }): Promise<void>;
    private migrateBackup;
    private migrateData;
    private validate;
    private verify;
}
export {};
