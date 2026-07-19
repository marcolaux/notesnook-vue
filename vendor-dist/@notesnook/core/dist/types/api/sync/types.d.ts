import { Cipher } from "@notesnook/crypto";
export declare const KEY_VERSION: {
    readonly LEGACY: 0;
    readonly DEK: 1;
};
export type KeyVersion = (typeof KEY_VERSION)[keyof typeof KEY_VERSION];
export type SyncItem = {
    id: string;
    v: number;
    keyVersion?: KeyVersion;
} & Cipher<"base64">;
export type SyncableItemType = keyof typeof SYNC_COLLECTIONS_MAP;
export declare const SYNC_COLLECTIONS_MAP: {
    readonly settingitem: "settings";
    readonly attachment: "attachments";
    readonly content: "content";
    readonly notebook: "notebooks";
    readonly shortcut: "shortcuts";
    readonly reminder: "reminders";
    readonly relation: "relations";
    readonly tag: "tags";
    readonly color: "colors";
    readonly note: "notes";
    readonly vault: "vaults";
    readonly inboxitemhistory: "inboxItemsHistory";
};
export declare const SYNC_ITEM_TYPES: SyncableItemType[];
export type SyncTransferItem = {
    items: SyncItem[];
    type: SyncableItemType;
    count: number;
};
export type SyncInboxItem = {
    id: string;
    v: number;
    cipher: string;
    alg: string;
};
