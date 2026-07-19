import { PropsWithChildren } from "react";
import { ActionSheetPresenterProps } from "../action-sheet/index.js";
import { MenuPresenterProps, PopupPresenterProps } from "@notesnook/ui";
type ResponsiveContainerProps = {
    mobile?: JSX.Element;
    desktop?: JSX.Element;
};
export declare function ResponsiveContainer(props: ResponsiveContainerProps): JSX.Element | null;
export declare function DesktopOnly(props: PropsWithChildren<unknown>): import("react/jsx-runtime").JSX.Element;
export declare function MobileOnly(props: PropsWithChildren<unknown>): import("react/jsx-runtime").JSX.Element;
export type PopupType = "sheet" | "menu" | "none" | "popup";
export type ResponsivePresenterProps = MenuPresenterProps & ActionSheetPresenterProps & PopupPresenterProps & {
    mobile?: PopupType;
    desktop?: PopupType;
    shouldCloseOnOverlayClick?: boolean;
};
export declare function ResponsivePresenter(props: PropsWithChildren<ResponsivePresenterProps>): import("react/jsx-runtime").JSX.Element | null;
export {};
