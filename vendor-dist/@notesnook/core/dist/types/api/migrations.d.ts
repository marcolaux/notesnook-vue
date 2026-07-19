import Database from "./index.js";
declare class Migrations {
    private readonly db;
    private readonly migrator;
    private migrating;
    version: number;
    constructor(db: Database);
    init(): Promise<void>;
    required(): boolean;
    migrate(): Promise<void>;
}
export default Migrations;
