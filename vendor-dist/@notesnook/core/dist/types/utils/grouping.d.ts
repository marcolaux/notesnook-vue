import { GroupHeader, GroupOptions, ItemType, SortOptions } from "../types.js";
type PartialGroupableItem = {
    id: string;
    type?: ItemType | null;
    dateDeleted?: number | null;
    title?: string | null;
    filename?: string | null;
    dateEdited?: number | null;
    dateCreated?: number | null;
};
export type GroupKeySelectorFunction<T> = (item: T) => string;
export declare const getSortValue: (options: SortOptions | undefined, item: PartialGroupableItem) => number;
export declare function getSortSelectors<T extends PartialGroupableItem>(options: SortOptions): {
    asc: (a: T, b: T) => number;
    desc: (a: T, b: T) => number;
};
export declare function createKeySelector(options?: GroupOptions): GroupKeySelectorFunction<PartialGroupableItem>;
export declare function groupArray<T>(items: T[], keySelector: GroupKeySelectorFunction<T>): Map<number, {
    index: number;
    group: GroupHeader;
}>;
export {};
