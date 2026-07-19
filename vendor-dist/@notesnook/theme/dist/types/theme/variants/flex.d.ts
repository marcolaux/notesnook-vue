import { ThemeUIStyleObject } from "@theme-ui/core";
type FlexDirection = "row" | "column";
export type FlexVariants<T extends FlexDirection> = T extends "row" ? {
    rowCenter: ThemeUIStyleObject;
    rowFill: ThemeUIStyleObject;
    rowCenterFill: ThemeUIStyleObject;
} : {
    columnCenter: ThemeUIStyleObject;
    columnFill: ThemeUIStyleObject;
    columnCenterFill: ThemeUIStyleObject;
};
export declare function createFlexVariants<T extends FlexDirection>(direction: T): FlexVariants<T>;
export {};
