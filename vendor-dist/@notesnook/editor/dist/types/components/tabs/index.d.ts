import React, { PropsWithChildren } from "react";
import { FlexProps } from "@theme-ui/components";
export type TabProps = {
    title: string | React.ReactElement;
};
export declare function Tab(props: PropsWithChildren<TabProps>): import("react/jsx-runtime").JSX.Element;
export type TabsProps = {
    activeIndex: number;
    containerProps?: FlexProps;
    onTabChanged?: (index: number) => void;
};
export declare function Tabs(props: PropsWithChildren<TabsProps>): import("react/jsx-runtime").JSX.Element;
