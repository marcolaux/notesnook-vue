export declare function findItemAndDelete<T>(array: T[], predicate: (item: T) => boolean): boolean;
export declare function addItem<T>(array: T[], item: T): boolean;
export declare function addItems<T>(array: T[], ...items: T[]): T[];
export declare function deleteItem<T>(array: T[], item: T): boolean;
export declare function deleteItems<T>(array: T[], ...items: T[]): T[];
export declare function findById<T extends {
    id: string;
}>(array: T[], id: string): false | T | undefined;
export declare function findOrAdd<T>(array: T[], predicate: (item: T) => boolean, item: T): T;
export declare function hasItem<T>(array: T[], item: T): boolean;
export declare function toChunks<T>(array: T[], chunkSize: number): T[][];
export declare function chunkedIterate<T>(array: T[], chunkSize: number): Generator<T[], void, unknown>;
export declare function chunkify<T>(iterator: AsyncIterableIterator<T> | IterableIterator<T>, chunkSize: number): AsyncGenerator<T[], void, unknown>;
