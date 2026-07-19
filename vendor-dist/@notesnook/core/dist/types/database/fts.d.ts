import { Kysely } from "@streetwriters/kysely";
import { RawDatabaseSchema } from "./index.js";
export declare function rebuildSearchIndex(db: Kysely<RawDatabaseSchema>): Promise<void>;
