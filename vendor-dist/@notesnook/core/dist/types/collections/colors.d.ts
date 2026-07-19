import { ICollection } from "./collection.js";
import { Color } from "../types.js";
import Database from "../api/index.js";
import { SQLCollection } from "../database/sql-collection.js";
export declare const DefaultColors: Record<string, string>;
export declare class Colors implements ICollection {
    private readonly db;
    name: string;
    readonly collection: SQLCollection<"colors", Color>;
    constructor(db: Database);
    init(): Promise<void>;
    color(id: string): Promise<Color | undefined>;
    find(colorCode: string): Promise<Color | undefined>;
    add(item: Partial<Color>): Promise<string>;
    get all(): import("../database/sql-collection.js").FilteredSelector<Color>;
    count(id: string): Promise<number | undefined>;
    remove(...ids: string[]): Promise<void>;
    exists(id: string): Promise<boolean>;
}
