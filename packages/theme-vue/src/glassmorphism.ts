/**
 * Glassmorphism token emission (decision #5).
 *
 * `ThemeDefinition` (the published upstream type) has no glassmorphism fields.
 * We extend it *locally* with an optional `glassmorphism` field (see `types.ts`)
 * — backward compatible: a plain `ThemeDefinition` gets the defaults.
 */
import type { VueTheme, Glassmorphism } from "./types";

/** Defaults match the prior `style.css` placeholder (`24px`, slate.900/65%). */
export const DEFAULT_GLASSMORPHISM = {
  backdropBlur: "24px",
  surfaceOpacity: 65
} as const satisfies Required<Glassmorphism>;

/** Resolve a theme's glassmorphism with defaults filled in. */
export function resolveGlassmorphism(theme: VueTheme): Required<Glassmorphism> {
  return {
    backdropBlur: theme.glassmorphism?.backdropBlur ?? DEFAULT_GLASSMORPHISM.backdropBlur,
    surfaceOpacity:
      theme.glassmorphism?.surfaceOpacity ?? DEFAULT_GLASSMORPHISM.surfaceOpacity
  };
}

/**
 * Emit the glassmorphism CSS variables on `:root`:
 *   --nn-backdrop-blur: <length>;   (used by `backdrop-filter: blur(...)`)
 *   --nn-surface-opacity: <0-100>;   (alpha for translucent surfaces)
 * The `:root` bridge in `tailwind-bridge.ts` maps `--backdrop-blur-base` to
 * `--nn-backdrop-blur` so existing `var(--backdrop-blur-base)` refs keep working.
 */
export function glassmorphismToCSS(theme: VueTheme): string {
  const { backdropBlur, surfaceOpacity } = resolveGlassmorphism(theme);
  return `:root {\n  --nn-backdrop-blur: ${backdropBlur};\n  --nn-surface-opacity: ${surfaceOpacity};\n}`;
}