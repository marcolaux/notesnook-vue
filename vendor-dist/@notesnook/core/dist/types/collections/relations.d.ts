import { ICollection } from "./collection.js";
import { Relation, ItemMap, ItemReference, ItemReferences } from "../types.js";
import Database from "../api/index.js";
import { FilteredSelector, SQLCollection } from "../database/sql-collection.js";
export declare class Relations implements ICollection {
    private readonly db;
    name: string;
    readonly collection: SQLCollection<"relations", Relation>;
    constructor(db: Database);
    init(): Promise<void>;
    add(from: ItemReference, to: ItemReference): Promise<void>;
    from(reference: ItemReference | ItemReferences): RelationsArray<keyof RelatableTable>;
    from(reference: ItemReference | ItemReferences, types: (keyof RelatableTable)[]): RelationsArray<keyof RelatableTable>;
    from<TType extends keyof RelatableTable>(reference: ItemReference | ItemReferences, type: TType): RelationsArray<TType>;
    to(reference: ItemReference | ItemReferences): RelationsArray<keyof RelatableTable>;
    to(reference: ItemReference | ItemReferences, types: (keyof RelatableTable)[]): RelationsArray<keyof RelatableTable>;
    to<TType extends keyof RelatableTable>(reference: ItemReference | ItemReferences, type: TType): RelationsArray<TType>;
    fromCache: Map<string, string[]>;
    toCache: Map<string, string[]>;
    buildCache(): Promise<void>;
    remove(...ids: string[]): Promise<void>;
    unlink(from: ItemReference, to: ItemReference): Promise<void>;
    unlinkOfType(type: keyof RelatableTable, ids?: string[]): Promise<void>;
}
declare const TABLE_MAP: {
    readonly note: "notes";
    readonly notebook: "notebooks";
    readonly reminder: "reminders";
    readonly tag: "tags";
    readonly color: "colors";
    readonly attachment: "attachments";
    readonly vault: "vaults";
};
type RelatableTable = typeof TABLE_MAP;
declare class RelationsArray<TType extends keyof RelatableTable> {
    private readonly db;
    private readonly reference;
    private readonly types;
    private readonly direction;
    constructor(db: Database, reference: ItemReference | ItemReferences, types: TType[] | undefined, direction: "from" | "to");
    get selector(): FilteredSelector<ItemMap[TType]>;
    resolve(limit?: number): Promise<ItemMap[TType][]>;
    unlink(): Promise<void>;
    get(): Promise<{
        fromId: string;
        fromType: keyof ItemMap;
        toId: string;
        toType: keyof ItemMap;
    }[]>;
    count(): Promise<number>;
    has(...ids: string[]): Promise<boolean>;
    hasAll(...ids: string[]): Promise<boolean>;
    /**
     * Build an optimized query for obtaining relations based on the given
     * parameters. The resulting query uses a covering index (the most
     * optimizable index) for obtaining relations.
     */
    private buildRelationsQuery;
}
export {};
