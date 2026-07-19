export interface ICollection {
    name: string;
    init(): Promise<void>;
    invalidateCache?(): void | Promise<void>;
}
