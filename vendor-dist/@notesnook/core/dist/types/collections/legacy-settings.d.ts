import Database from "../api/index.js";
import { LegacySettingsItem } from "../types.js";
import { ICollection } from "./collection.js";
/**
 * @deprecated only kept here for migration purposes
 */
export declare class LegacySettings implements ICollection {
    private readonly db;
    name: string;
    private settings;
    constructor(db: Database);
    init(): Promise<void>;
    get raw(): LegacySettingsItem;
    /**
     * @deprecated only kept here for migration purposes
     */
    getAlias(id: string): string | undefined;
}
