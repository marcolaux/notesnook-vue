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