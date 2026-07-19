import { variants } from "./variants/index.js";
import { FontConfig } from "./font/index.js";
import { ThemeConfig } from "./types.js";
import { ThemeColor } from "../theme-engine/types.js";
import { Theme as ThemeUITheme } from "@theme-ui/css";
export { createButtonVariant } from "./variants/button.js";
export { getFontConfig } from "./font/index.js";
export type Theme = {
    breakpoints: string[];
    space: (number | string)[] & {
        small?: number | string;
    };
    sizes: {
        full: "100%";
        half: "50%";
    };
    radii: {
        none: number;
        default: number;
        dialog: number;
        large: number;
        small: number;
    };
    shadows: {
        menu: string;
    };
    colors: Record<ThemeColor, string>;
    iconSizes: {
        small: number;
        medium: number;
        big: number;
    };
    config: ThemeUITheme["config"];
} & FontConfig & typeof variants;
export declare class ThemeFactory {
    static construct(config: ThemeConfig): Theme;
}
