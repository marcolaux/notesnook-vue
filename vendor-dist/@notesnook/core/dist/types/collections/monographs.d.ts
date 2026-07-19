import Database from "../api/index.js";
import { Monograph } from "../types.js";
import { ICollection } from "./collection.js";
import { SQLCollection } from "../database/sql-collection.js";
export declare class Monographs implements ICollection {
    private readonly db;
    name: string;
    readonly collection: SQLCollection<"monographs", Monograph>;
    constructor(db: Database);
    init(): Promise<void>;
    get all(): import("../database/sql-collection.js").FilteredSelector<Monograph>;
    add(monograph: Partial<Monograph>): Promise<void>;
}
