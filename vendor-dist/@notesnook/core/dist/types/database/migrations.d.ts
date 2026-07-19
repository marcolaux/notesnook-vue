import { Migration, MigrationProvider } from "@streetwriters/kysely";
export declare class NNMigrationProvider implements MigrationProvider {
    getMigrations(): Promise<Record<string, Migration>>;
}
