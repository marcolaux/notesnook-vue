import { Editor } from "../types.js";
import { IconNames } from "./icons.js";
import { ToolId } from "./tools/index.js";
export type ToolButtonVariant = "small" | "normal";
export type ToolProps = ToolDefinition & {
    editor: Editor;
    variant?: ToolButtonVariant;
    force?: boolean;
    parentGroup?: string;
};
export type ToolDefinition = {
    icon: IconNames;
    title: string;
    conditional?: boolean;
    description?: string;
};
export type ToolbarGroupDefinition = (ToolId | ToolId[])[];
export type ToolbarDefinition = ToolbarGroupDefinition[];
