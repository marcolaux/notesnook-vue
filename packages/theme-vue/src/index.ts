/**
 * `@notesnook-vue/theme-vue` — Tailwind-token adapter for `@notesnook/theme`.
 *
 * Maps a Notesnook `ThemeDefinition` (imported type-only from `@notesnook/theme`)
 * to CSS variables the Vue renderer consumes, plus a backward-compatible
 * glassmorphism extension. The CSS-generation logic and built-in default
 * themes are vendored here (not imported at runtime) so React/theme-ui/zustand
 * stay out of the renderer bundle.
 *
 * Public surface:
 * - `injectTheme(theme)` / `setTheme(theme)` / `getCurrentTheme()` — runtime DOM injection.
 * - `themeToCSS(theme)` — byte-compatible upstream CSS (scoped `.theme-scope-*` vars).
 * - `validateTheme(json)` — vendored schema validator.
 * - `ThemeDark` / `ThemeLight` — vendored built-in themes (data only).
 * - `TAILWIND_TOKEN_MAP` — the `--color-*` → `--<upstream>` bridge definition.
 * - `DEFAULT_GLASSMORPHISM` / `resolveGlassmorphism()` — glassmorphism tokens.
 */
export type {
  VueTheme,
  Glassmorphism,
  ThemeDefinition,
  ThemeScopes,
  Variants,
  Colors,
  PartialVariants,
  PreviewColors,
  CompiledThemeDefinition,
  ThemeMetadata
} from "./types";

export { ThemeDark, ThemeLight } from "./defaults";
export {
  themeToCSS,
  buildVariants,
  colorsToCSSVariables,
  deriveShadeColor,
  THEME_SCOPES,
  Variants as VariantKeys,
  StaticColors
} from "./theme-to-css";
export { getPreviewColors, THEME_COMPATIBILITY_VERSION } from "./preview";
export { validateTheme } from "./validate-theme";
export type { ThemeValidationResult } from "./validate-theme";
export { injectTheme, setTheme, getCurrentTheme } from "./inject";
export { TAILWIND_TOKEN_MAP, tailwindBridgeToCSS } from "./tailwind-bridge";
export { DEFAULT_GLASSMORPHISM, resolveGlassmorphism, glassmorphismToCSS } from "./glassmorphism";
export { blockColorizeToCSS } from "./block-colorize";
export { highlightToCSS } from "./highlight";
export {
  CONTRAST_TARGET,
  parseRGB,
  relativeLuminance,
  contrastRatio,
  srgbToOklch,
  oklchToSrgb,
  oklchToCss,
  adjustForContrast
} from "./color-contrast";
export type { RGB, OKLCH } from "./color-contrast";