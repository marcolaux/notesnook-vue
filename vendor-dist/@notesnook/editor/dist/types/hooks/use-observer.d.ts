type ObserverType = {
    threshold: number;
    rootMargin?: string;
    once?: boolean;
};
export declare function useObserver<T extends Element = Element>({ threshold, rootMargin, once }: ObserverType): {
    inView: boolean | undefined;
    ref: import("react").RefObject<T>;
};
export {};
