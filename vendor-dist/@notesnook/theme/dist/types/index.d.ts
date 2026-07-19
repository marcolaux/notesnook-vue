import { SchemeColors, SchemeColorsAsCSSVariables, ThemeDefinition } from "./theme-engine/types.js";
export * from "./theme/index.js";
export * from "./theme-engine/index.js";
export * from "./theme-engine/types.js";
export * from "./emotion/index.js";
declare global {
    var DEFAULT_THEME: ThemeDefinition | undefined;
}
declare module "csstype" {
    interface Properties {
        backgroundColor?: Property.BackgroundColor | SchemeColors | SchemeColorsAsCSSVariables;
        color?: Property.Color | SchemeColors | SchemeColorsAsCSSVariables;
        accentColor?: Property.AccentColor | SchemeColors | SchemeColorsAsCSSVariables;
        borderColor?: Property.BorderColor | SchemeColors | SchemeColorsAsCSSVariables;
        borderBottomColor?: Property.BorderBottomColor | SchemeColors | SchemeColorsAsCSSVariables;
        borderTopColor?: Property.BorderTopColor | SchemeColors | SchemeColorsAsCSSVariables;
        borderLeftColor?: Property.BorderLeftColor | SchemeColors | SchemeColorsAsCSSVariables;
        borderRightColor?: Property.BorderRightColor | SchemeColors | SchemeColorsAsCSSVariables;
    }
}
