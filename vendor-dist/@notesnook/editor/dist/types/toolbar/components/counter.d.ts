import React from "react";
export type CounterProps = {
    title: string;
    onIncrease: () => void;
    onDecrease: () => void;
    onReset: () => void;
    value: string;
    disabled?: boolean;
};
declare function _Counter(props: CounterProps): import("react/jsx-runtime").JSX.Element;
export declare const Counter: React.MemoExoticComponent<typeof _Counter>;
export {};
