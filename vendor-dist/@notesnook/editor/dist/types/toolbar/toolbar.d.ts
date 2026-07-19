import { FlexProps } from "@theme-ui/components";
import { Editor } from "../types.js";
import { ToolbarLocation } from "./stores/toolbar-store.js";
import { ToolbarDefinition } from "./types.js";
type ToolbarProps = FlexProps & {
    editor: Editor;
    location: ToolbarLocation;
    tools?: ToolbarDefinition;
    defaultFontFamily: string;
    defaultFontSize: number;
    editorId?: string;
};
export declare function Toolbar(props: ToolbarProps): import("react/jsx-runtime").JSX.Element;
export {};
