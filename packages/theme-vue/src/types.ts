/**
 * Theme types for the Vue renderer.
 *
 * The `ThemeDefinition` contract is imported **type-only** from `@notesnook/theme`
 * (erased at build time) so the renderer never pulls `@notesnook/theme`'s runtime
 * (React + theme-ui + zustand) into the bundle. The runtime CSS-generation logic
 * and the built-in default themes are vendored in this package instead.
 */
import type {
  ThemeDefinition,
  ThemeScopes,
  Variants,
  Colors,
  PartialVariants
} from "@notesnook/theme";

export type {
  ThemeDefinition,
  ThemeScopes,
  Variants,
  Colors,
  PartialVariants
};

/**
 * Glassmorphism tokens (decision #5). A locally-augmented, **backward-compatible**
 * extension of `ThemeDefinition`: the field is optional and every member is
 * optional, so a plain `ThemeDefinition` (no `glassmorphism`) gets the defaults.
 *
 * Global for MVP — one blur/opacity treatment for every translucent pane. Promote
 * to per-scope later by also allowing a `Glassmorphism` inside each scope
 * (additive, still backward compatible).
 */
export type Glassmorphism = {
  /** CSS length for `backdrop-filter: blur(...)`. Default `"24px"`. */
  backdropBlur?: string;
  /** 0–100 integer alpha applied to translucent surfaces. Default `65`. */
  surfaceOpacity?: number;
};

/** A Notesnook `ThemeDefinition` plus our optional glassmorphism extension. */
export type VueTheme = ThemeDefinition & { glassmorphism?: Glassmorphism };

/**
 * A reduced color set derived from a theme's scopes (every value falls back to
 * `base.primary.*`, or `base.success.icon` for the status-bar icon) — used to
 * render a theme preview card without the full scope/variant payload. Vendored
 * port of upstream `PreviewColors` (`packages/theme/src/theme-engine/types.ts`).
 */
export type PreviewColors = {
  editor: string;
  accentForeground: string;
  navigationMenu: {
    shade: string;
    accent: string;
    background: string;
    icon: string;
  };
  list: {
    heading: string;
    accent: string;
    accentForeground: string;
    background: string;
  };
  statusBar: {
    paragraph: string;
    background: string;
    icon: string;
  };
  border: string;
  paragraph: string;
  background: string;
  accent: string;
};

/**
 * A `ThemeDefinition` plus the catalog metadata the themes server attaches
 * (`sourceURL`, `totalInstalls`, `previewColors`). The `installTheme` response
 * is a full `CompiledThemeDefinition` (incl. `scopes` + `codeBlockCSS`); a
 * `ThemeMetadata` (catalog list item) is the same minus `scopes`/`codeBlockCSS`.
 * Vendored because `@notesnook/themes-server` is private (not on npm).
 */
export type CompiledThemeDefinition = VueTheme & {
  sourceURL?: string;
  totalInstalls?: number;
  previewColors: PreviewColors;
};

/** Catalog list item — a compiled theme with the heavy `scopes`/`codeBlockCSS`
 *  stripped (the server only returns those on `installTheme`). */
export type ThemeMetadata = Omit<CompiledThemeDefinition, "scopes" | "codeBlockCSS">;