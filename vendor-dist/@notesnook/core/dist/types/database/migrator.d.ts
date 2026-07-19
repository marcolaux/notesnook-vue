import { DatabaseSchema } from "./index.js";
import Database from "../api/index.js";
import { CollectionType, Item, MaybeDeletedItem } from "../types.js";
export type RawItem = MaybeDeletedItem<Item>;
type MigratableCollection = {
    name: CollectionType;
    table: keyof DatabaseSchema;
};
export type MigratableCollections = MigratableCollection[];
declare class Migrator {
    migrate(db: Database, collections: MigratableCollections, version: number): Promise<boolean>;
    private migrateToSQLite;
    private migrateItems;
}
export default Migrator;
