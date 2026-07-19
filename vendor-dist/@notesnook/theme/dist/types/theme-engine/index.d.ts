import { ThemeCompatibilityVersion, ThemeDefinition, ThemeScopes, VariantsWithStaticColors } from "./types.js";
declare const ThemeLight: ThemeDefinition;
declare const ThemeDark: ThemeDefinition;
type ThemeScope = {
    colors: VariantsWithStaticColors<true>;
    scope: keyof ThemeScopes;
    isDark: boolean;
};
type ThemeEngineState = {
    theme: ThemeDefinition;
    setTheme: (theme: ThemeDefinition) => void;
};
declare const useThemeEngineStore: import("zustand").UseBoundStore<import("zustand").StoreApi<ThemeEngineState>>;
export declare function useThemeColors(scope?: keyof ThemeScopes): ThemeScope;
export declare const useCurrentThemeScope: () => keyof ThemeScopes;
export declare const ScopedThemeProvider: import("react").Provider<keyof ThemeScopes>;
export declare const THEME_COMPATIBILITY_VERSION: ThemeCompatibilityVersion;
export { ThemeLight, ThemeDark, useThemeEngineStore, type ThemeEngineState };
export { getPreviewColors, themeToCSS } from "./utils.js";
export { validateTheme } from "./validator.js";
