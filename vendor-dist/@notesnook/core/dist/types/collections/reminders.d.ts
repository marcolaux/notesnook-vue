import { ICollection } from "./collection.js";
import { Reminder, TimeFormat } from "../types.js";
import Database from "../api/index.js";
import { SQLCollection } from "../database/sql-collection.js";
export declare class Reminders implements ICollection {
    private readonly db;
    name: string;
    readonly collection: SQLCollection<"reminders", Reminder>;
    constructor(db: Database);
    init(): Promise<void>;
    /**
     * Required to satisfy the ICollection interface.
     * This collection does not currently maintain a local cache that needs invalidation,
     * but the method must exist for type safety when iterating over all collections.
     */
    invalidateCache(): void;
    add(reminder: Partial<Reminder>): Promise<string | undefined>;
    get all(): import("../database/sql-collection.js").FilteredSelector<Reminder>;
    get active(): import("../database/sql-collection.js").FilteredSelector<Reminder>;
    exists(itemId: string): Promise<boolean>;
    reminder(id: string): Promise<Reminder | undefined>;
    remove(...reminderIds: string[]): Promise<void>;
}
export declare function formatReminderTime(reminder: Reminder, short?: boolean, options?: {
    timeFormat: TimeFormat;
    dateFormat: string;
}): string;
export declare function isReminderToday(reminder: Reminder): boolean;
export declare function getUpcomingReminderTime(reminder: Reminder): number;
export declare function getUpcomingReminder(reminders: Reminder[]): Reminder;
export declare function isReminderActive(reminder: Reminder): boolean;
export declare function createUpcomingReminderTimeQuery(unix?: string): import("@streetwriters/kysely").RawBuilder<number>;
export declare function createIsReminderActiveQuery(now?: string): import("@streetwriters/kysely").RawBuilder<boolean>;
