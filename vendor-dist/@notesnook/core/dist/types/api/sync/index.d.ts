import Collector from "./collector.js";
import { type HubConnection } from "@microsoft/signalr";
import Merger from "./merger.js";
import { AutoSync } from "./auto-sync.js";
import { Mutex } from "async-mutex";
import Database from "../index.js";
import { SerializedKey } from "@notesnook/crypto";
import { KeyVersion, SyncTransferItem } from "./types.js";
import { SyncDevices } from "./devices.js";
export type SyncOptions = {
    type: "full" | "fetch" | "send";
    force?: boolean;
    offlineMode?: boolean;
};
export default class SyncManager {
    private readonly db;
    sync: Sync;
    devices: SyncDevices;
    constructor(db: Database);
    start(options: SyncOptions): Promise<boolean>;
    acquireLock(callback: () => Promise<void>): Promise<void>;
    stop(): Promise<void>;
}
export declare class Sync {
    private readonly db;
    collector: Collector;
    merger: Merger;
    autoSync: AutoSync;
    logger: import("@notesnook/logger").ILogger;
    syncConnectionMutex: Mutex;
    connection?: HubConnection;
    devices: SyncDevices;
    private conflictedNoteIds;
    private uncachedAttachments;
    constructor(db: Database);
    start(options: SyncOptions): Promise<void>;
    init(isForceSync?: boolean): Promise<{
        deviceId: string;
    }>;
    fetch(deviceId: string, options: SyncOptions): Promise<void>;
    send(deviceId: string, isForceSync?: boolean): Promise<boolean>;
    stop(options: SyncOptions): Promise<void>;
    cancel(): Promise<void>;
    /**
     * @private
     */
    uploadAttachments(): Promise<void>;
    /**
     * @private
     */
    onPushCompleted(deviceId: string): Promise<void>;
    processChunk(chunk: SyncTransferItem, keys: {
        version: KeyVersion;
        key: SerializedKey;
    }[], options: SyncOptions): Promise<void>;
    private pushItem;
    private createConnection;
    private checkConnection;
}
