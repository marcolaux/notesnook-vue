import React from "react";
import { BoxProps } from "@theme-ui/components";
import { ThemeScopes } from "../theme-engine/types.js";
import { Theme } from "../theme/index.js";
export type EmotionThemeProviderProps = {
    scope?: keyof ThemeScopes;
    injectCssVars?: boolean;
    theme?: Partial<Theme>;
} & Omit<BoxProps, "variant" | "ref">;
export declare const EmotionThemeProvider: React.ForwardRefExoticComponent<{
    scope?: keyof ThemeScopes;
    injectCssVars?: boolean;
    theme?: Partial<Theme>;
} & Omit<BoxProps, "variant" | "ref"> & React.RefAttributes<HTMLDivElement>>;
