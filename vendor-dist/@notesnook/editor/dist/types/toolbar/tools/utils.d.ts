import { Editor } from "../../types.js";
import { MenuButtonItem } from "@notesnook/ui";
import { ToolDefinition, ToolProps } from "../types.js";
import { IconNames } from "../icons.js";
export declare function menuButtonToTool(constructItem: (editor: Editor) => MenuButtonItem): (props: ToolProps & {
    icon: IconNames;
}) => import("react/jsx-runtime").JSX.Element;
export declare function toolToMenuButton(tool: ToolDefinition): MenuButtonItem;
