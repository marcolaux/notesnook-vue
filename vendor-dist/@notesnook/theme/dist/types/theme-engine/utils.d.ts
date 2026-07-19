import { Colors, PreviewColors, ThemeDefinition, ThemeScopes, Variants, VariantsWithStaticColors } from "./types.js";
export declare function getPreviewColors(theme: ThemeDefinition): PreviewColors;
export declare function themeToCSS(theme: ThemeDefinition): string;
export declare function buildVariants(scope: keyof ThemeScopes, theme: ThemeDefinition, themeScope: Partial<Variants>): VariantsWithStaticColors<true>;
export declare function colorsToCSSVariables(colors: Colors, variantKey?: string): string;
