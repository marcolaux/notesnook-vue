import { PropsWithChildren } from "react";
import { ToolButtonProps } from "./tool-button.js";
import React from "react";
export type SplitButtonProps = ToolButtonProps & {
    onOpen: () => void;
};
declare function _SplitButton(props: PropsWithChildren<SplitButtonProps>): import("react/jsx-runtime").JSX.Element;
export declare const SplitButton: React.MemoExoticComponent<typeof _SplitButton>;
export {};
