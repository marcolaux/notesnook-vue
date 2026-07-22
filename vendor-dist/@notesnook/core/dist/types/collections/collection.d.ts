export interface ICollection {
    name: string;
    init(): Promise<void>;
}
