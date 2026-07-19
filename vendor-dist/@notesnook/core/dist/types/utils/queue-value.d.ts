export declare class QueueValue<T> {
    #private;
    readonly value: T;
    private readonly destructor;
    constructor(value: T, destructor: () => void);
    use(): T;
    discard(): void;
}
