import { ThemeDefinition } from "./types.js";
export declare function validateTheme(json: Partial<ThemeDefinition>): {
    error: string | undefined;
};
export declare function isThemeDefinition(json: Partial<ThemeDefinition>): json is ThemeDefinition;
