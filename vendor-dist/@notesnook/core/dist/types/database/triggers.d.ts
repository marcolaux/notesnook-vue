import { Kysely } from "@streetwriters/kysely";
import { DatabaseSchema, RawDatabaseSchema } from "./index.js";
export declare function createTriggers(db: Kysely<RawDatabaseSchema>): Promise<void>;
export declare function dropTriggers(db: Kysely<DatabaseSchema>): Promise<void>;
