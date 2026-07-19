import Database from "../index.js";
import { SyncTransferItem } from "./types.js";
declare class Collector {
    private readonly db;
    logger: import("@notesnook/logger").ILogger;
    constructor(db: Database);
    hasUnsyncedChanges(): Promise<boolean>;
    collect(chunkSize: number, isForceSync?: boolean): AsyncGenerator<SyncTransferItem, void, unknown>;
}
export default Collector;
