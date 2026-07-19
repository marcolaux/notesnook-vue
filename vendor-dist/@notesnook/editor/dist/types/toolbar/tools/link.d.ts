import { ToolProps } from "../types.js";
export declare function LinkSettings(props: ToolProps): import("react/jsx-runtime").JSX.Element | null;
export declare function AddLink(props: ToolProps): import("react/jsx-runtime").JSX.Element;
export declare function AddInternalLink(props: ToolProps): import("react/jsx-runtime").JSX.Element;
export declare function EditLink(props: ToolProps): import("react/jsx-runtime").JSX.Element | null;
export declare function RemoveLink(props: ToolProps): import("react/jsx-runtime").JSX.Element | null;
export declare function OpenLink(props: ToolProps): import("react/jsx-runtime").JSX.Element | null;
export declare function CopyLink(props: ToolProps): import("react/jsx-runtime").JSX.Element | null;
export type LinkDefinition = {
    href: string;
    title?: string;
};
export declare function isInternalLink(href?: string | null): boolean;
