import { ToolProps } from "../types.js";
type ColorType = "background" | "text" | "border";
type ColorToolProps = ToolProps & {
    onColorChange: (color?: string) => void;
    activeColor?: string;
    title: string;
    cacheKey: string;
    type: ColorType;
};
export declare const DEFAULT_COLORS: Record<ColorType, string[]>;
export declare function ColorTool(props: ColorToolProps): import("react/jsx-runtime").JSX.Element;
export declare function Highlight(props: ToolProps): import("react/jsx-runtime").JSX.Element;
export declare function TextColor(props: ToolProps): import("react/jsx-runtime").JSX.Element;
export {};
