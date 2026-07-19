export declare class LazyPromise<T> {
    private _promise;
    private _resolve?;
    constructor();
    resolve(result: T): void;
    get promise(): Promise<T>;
}
