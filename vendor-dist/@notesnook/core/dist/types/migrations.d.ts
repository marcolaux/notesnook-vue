import Database from "./api/index.js";
import { ContentItem, HistorySession, ItemMap, ItemType, MaybeDeletedItem } from "./types.js";
import { IndexedCollection } from "./database/indexed-collection.js";
import { Cipher } from "@notesnook/crypto";
type MigrationType = "local" | "sync" | "backup";
type MigrationItemType = ItemType | "notehistory" | "content" | "never";
type MigrationItemMap = ItemMap & {
    notehistory: HistorySession;
    content: ContentItem;
    never: never;
};
export declare function migrateItem<TItemType extends MigrationItemType>(item: MaybeDeletedItem<MigrationItemMap[TItemType]>, itemVersion: number, databaseVersion: number, type: TItemType, database: Database, migrationType: MigrationType): Promise<boolean | "skip">;
/**
 * @deprecated
 */
export declare function migrateCollection(collection: IndexedCollection, version: number): Promise<void>;
/**
 * @deprecated
 */
export declare function migrateVaultKey(db: Database, vaultKey: Cipher<"base64">, version: number, databaseVersion: number): Promise<void>;
/**
 * @deprecated
 */
export declare function migrateKV(db: Database, version: number, databaseVersion: number): Promise<void>;
export declare function tinyToTiptap(html: string): string;
export {};
