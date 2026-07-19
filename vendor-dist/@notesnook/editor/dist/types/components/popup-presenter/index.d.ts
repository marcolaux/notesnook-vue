import { PropsWithChildren } from "react";
import { PositionOptions, PopupPresenterProps } from "@notesnook/ui";
import React from "react";
import { ResponsivePresenterProps } from "../responsive/index.js";
export type PopupWrapperProps = UsePopupHandlerOptions & {
    autoCloseOnUnmount?: boolean;
    position: PositionOptions;
} & Partial<Omit<PopupPresenterProps, "onClose" | "isOpen">>;
export declare function PopupWrapper(props: PropsWithChildren<PopupWrapperProps>): import("react/jsx-runtime").JSX.Element;
type UsePopupHandlerOptions = {
    id: string;
    group: string;
    onClosed?: () => void;
};
export declare function usePopupHandler(options: UsePopupHandlerOptions): {
    isPopupOpen: boolean;
    closePopup: () => void;
};
type ShowPopupOptions = {
    popup: (closePopup: () => void) => React.ReactNode;
} & Partial<ResponsivePresenterProps>;
export declare function showPopup(options: ShowPopupOptions): () => void;
export {};
