import { DatabaseAccessor } from "./index.js";
export declare class Sanitizer {
    private readonly db;
    tables: Record<string, Set<string>>;
    logger: import("@notesnook/logger").ILogger;
    constructor(db: DatabaseAccessor);
    init(): Promise<void>;
    /**
     * Sanitization is done based on the latest table schema in the database. All
     * unrecognized keys are removed
     */
    sanitize(table: string, item: any): boolean;
}
