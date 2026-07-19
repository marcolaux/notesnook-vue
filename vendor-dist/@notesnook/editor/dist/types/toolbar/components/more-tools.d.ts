import { ToolProps } from "../types.js";
import { ToolId } from "../tools/index.js";
type MoreToolsProps = ToolProps & {
    popupId: string;
    tools: ToolId[];
    autoCloseOnUnmount?: boolean;
    autoOpen?: boolean;
    group?: string;
};
export declare function MoreTools(props: MoreToolsProps): import("react/jsx-runtime").JSX.Element;
export {};
