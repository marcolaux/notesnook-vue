import { PropsWithChildren } from "react";
type Action = {
    title: string;
    onClick: () => void;
    loading?: boolean;
    disabled?: boolean;
};
export type PopupProps = {
    title?: string;
    onClose?: () => void;
    onPin?: () => void;
    isPinned?: boolean;
    action?: Action;
};
export declare function Popup(props: PropsWithChildren<PopupProps>): import("react/jsx-runtime").JSX.Element;
export {};
