import { PropsWithChildren } from "react";
import { MenuItem } from "@notesnook/ui";
export type ActionSheetPresenterProps = {
    items?: MenuItem[];
    isOpen: boolean;
    onClose?: () => void;
    blocking?: boolean;
    focusOnRender?: boolean;
    draggable?: boolean;
    title?: string;
};
export declare function ActionSheetPresenter(props: PropsWithChildren<ActionSheetPresenterProps>): import("react/jsx-runtime").JSX.Element | null;
