import Database from "../index.js";
export declare class AutoSync {
    private readonly db;
    private readonly interval;
    timeout: number;
    isAutoSyncing: boolean;
    logger: import("@notesnook/logger").ILogger;
    databaseUpdatedEvent?: {
        unsubscribe: () => boolean;
    };
    constructor(db: Database, interval: number);
    start(): Promise<void>;
    stop(): void;
    private schedule;
}
