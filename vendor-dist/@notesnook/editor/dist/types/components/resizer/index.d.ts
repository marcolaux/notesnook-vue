import { SchemeColors } from "@notesnook/theme";
import { PropsWithChildren } from "react";
type ResizerProps = {
    enabled: boolean;
    selected: boolean;
    width?: number;
    height?: number;
    handleColor?: SchemeColors;
    onResize: (width: number, height: number) => void;
    onResizeStop?: (width: number, height: number) => void;
    style?: React.CSSProperties;
    lockAspectRation?: boolean;
};
export declare function Resizer(props: PropsWithChildren<ResizerProps>): import("react/jsx-runtime").JSX.Element;
export {};
