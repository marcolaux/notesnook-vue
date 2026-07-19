type KeySelector<T> = (item: T) => string;
type Histogram<T> = Record<string, {
    value: T;
    frequency: number;
}>;
type HistogramEvaluator = (frequency: number) => boolean;
declare class SetManipulator {
    constructor();
    process<T>(a: T[], b: T[], key?: KeySelector<T>, evaluator?: HistogramEvaluator): Histogram<T> | T[];
    union<T>(a: T[], b: T[], key?: KeySelector<T>): T[];
    intersection<T>(a: T[], b: T[], key: KeySelector<T>): T[] | Histogram<T>;
    difference<T>(a: T[], b: T[], key?: KeySelector<T>): T[];
    complement<T>(a: T[], b: T[], key?: KeySelector<T>): T[] | Histogram<T>;
    equals<T>(a: T[], b: T[], key: KeySelector<T>): boolean;
}
export declare const set: SetManipulator;
export {};
