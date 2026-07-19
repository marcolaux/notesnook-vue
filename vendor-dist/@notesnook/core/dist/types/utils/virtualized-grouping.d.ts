import { GroupHeader } from "../types.js";
type BatchOperator<T> = (ids: string[], items: T[]) => Promise<unknown[]>;
export declare class VirtualizedGrouping<T> {
    readonly length: number;
    private readonly batchSize;
    readonly ids: () => Promise<string[]>;
    private readonly fetchItems;
    private readonly groupItems?;
    readonly groups?: (() => Promise<{
        index: number;
        group: GroupHeader;
    }[]>) | undefined;
    private cache;
    private pending;
    private _placeholders;
    constructor(length: number, batchSize: number, ids: () => Promise<string[]>, fetchItems: (start: number, end: number) => Promise<{
        ids: string[];
        items: T[];
    }>, groupItems?: ((items: T[]) => Map<number, {
        index: number;
        hidden?: boolean;
        group: GroupHeader;
    }>) | undefined, groups?: (() => Promise<{
        index: number;
        group: GroupHeader;
    }[]>) | undefined);
    get placeholders(): boolean[];
    key(index: number): string;
    type(index: number): "item" | "header-item";
    cacheItem(index: number): {
        item: T;
        group: GroupHeader | undefined;
        data: unknown;
    } | undefined;
    item(index: number): Promise<{
        item?: T;
        group?: GroupHeader;
    }>;
    item(index: number, operate: BatchOperator<T>): Promise<{
        item?: T;
        group?: GroupHeader;
        data: unknown;
    }>;
    /**
     *
     * @param index
     */
    private load;
    private batchLoader;
    private clear;
}
export {};
