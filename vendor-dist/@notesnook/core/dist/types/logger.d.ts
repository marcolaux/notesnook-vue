import { LogLevel, LogMessage, format, ILogger } from "@notesnook/logger";
import { Kysely } from "@streetwriters/kysely";
import { SQLiteOptions } from "./database/index.js";
type SQLiteItem<T> = {
    [P in keyof T]?: T[P] | null;
};
type LogMessageWithDate = LogMessage & {
    date: string;
};
export type LogDatabaseSchema = {
    logs: SQLiteItem<LogMessageWithDate>;
};
declare class DatabaseLogManager {
    private readonly db;
    constructor(db: Kysely<LogDatabaseSchema>);
    get(): Promise<{
        key: string;
        logs: LogMessage[];
    }[]>;
    clear(): Promise<void>;
    delete(key: string): Promise<void>;
    close(): Promise<void>;
}
declare function initialize(options: SQLiteOptions, disableConsoleLogs?: boolean): Promise<void>;
declare let logger: ILogger;
declare let logManager: DatabaseLogManager | undefined;
export { LogLevel, format, initialize, logManager, logger };
