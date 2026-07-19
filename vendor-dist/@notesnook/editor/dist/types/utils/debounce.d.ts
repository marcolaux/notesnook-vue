interface DebouncedFunction<Args extends any[], F extends (...args: Args) => any> {
    (this: ThisParameterType<F>, ...args: Args & Parameters<F>): void;
}
interface DebouncedFunctionWithId<Args extends any[], F extends (...args: Args) => any> {
    (this: ThisParameterType<F>, id: string | number, ...args: Args & Parameters<F>): void;
}
export declare function debounce<Args extends any[], F extends (...args: Args) => void>(func: F, waitFor: number): DebouncedFunction<Args, F>;
export declare function debounceWithId<Args extends any[], F extends (...args: Args) => void>(func: F, waitFor: number): DebouncedFunctionWithId<Args, F>;
export declare function inlineDebounce(id: string, func: () => void, waitFor: number): void;
export {};
