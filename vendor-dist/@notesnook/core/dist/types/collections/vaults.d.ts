import Database from "../api/index.js";
import { ItemReference, Vault } from "../types.js";
import { ICollection } from "./collection.js";
import { SQLCollection } from "../database/sql-collection.js";
export declare class Vaults implements ICollection {
    private readonly db;
    name: string;
    readonly collection: SQLCollection<"vaults", Vault>;
    constructor(db: Database);
    init(): Promise<void>;
    add(item: Partial<Vault>): Promise<string>;
    remove(id: string): Promise<void>;
    vault(id: string): Promise<Vault | undefined>;
    /**
     * This is temporary until we add proper support for multiple vaults
     * @deprecated
     */
    default(): Promise<Vault | undefined>;
    get all(): import("../database/sql-collection.js").FilteredSelector<Vault>;
    itemExists(reference: ItemReference): Promise<boolean>;
    removeAll(): Promise<void>;
}
