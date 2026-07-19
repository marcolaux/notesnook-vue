import { ToolbarGroupDefinition, ToolButtonVariant } from "../types.js";
import { FlexProps } from "@theme-ui/components";
import { Editor } from "../../types.js";
export type ToolbarGroupProps = FlexProps & {
    tools: ToolbarGroupDefinition;
    editor: Editor;
    variant?: ToolButtonVariant;
    force?: boolean;
    groupId: string;
};
export declare function ToolbarGroup(props: ToolbarGroupProps): import("react/jsx-runtime").JSX.Element;
