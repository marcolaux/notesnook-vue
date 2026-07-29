/**
 * Contrast-aware block-colorize CSS variable emitter.
 *
 * The block-colorize feature (`apps/desktop/.../style.css` under
 * `.ProseMirror.block-colorize`) tints editor text by node/mark type using the
 * theme system's `--*-static` Material palette — which is theme-invariant (same
 * hex light/dark). That washes out on light backgrounds (yellow/green/orange)
 * and on dark backgrounds (dark purple). This module emits a `:root { --bc-* }`
 * block where each colour has been OKLCH-lightness-adjusted against the active
 * theme's resolved background to meet {@link CONTRAST_TARGET} (WCAG AA). Called
 * from `injectTheme`, so the palette recomputes on every theme switch and
 * adapts to any 3rd-party catalog theme whose colours we don't know at build
 * time.
 *
 * `style.css` consumes these vars with the `--*-static` colour as a fallback
 * (`var(--bc-heading, var(--yellow-static))`), so the first paint before theme
 * injection still has a colour.
 */
import type { VueTheme } from "./types";
import { ThemeDark, ThemeLight } from "./defaults";
import { StaticColors } from "./theme-to-css";
import { adjustForContrast } from "./color-contrast";

/** Maps each block-colorize CSS variable to its source `StaticColors` key. */
const BLOCK_COLOR_SOURCES = {
  "--bc-heading": "yellow",
  "--bc-bold": "red",
  "--bc-italic": "green",
  "--bc-link": "purple",
  "--bc-list-1": "blue",
  "--bc-list-2": "red",
  "--bc-list-3": "yellow",
  "--bc-list-4": "green",
  "--bc-list-5": "orange",
  "--bc-code-keyword": "purple",
  "--bc-code-string": "green",
  "--bc-code-comment": "gray",
  "--bc-code-function": "blue",
  "--bc-code-number": "orange"
} as const satisfies Record<string, keyof typeof StaticColors>;

/** Resolve the editor background the same way `buildVariants` resolves `background`
 *  (theme base primary, falling back to the built-in for the colour scheme). The
 *  editor text sits on the `--background`-derived pane surface, so base primary
 *  `background` is the dominant reference colour. */
function resolveBackground(theme: VueTheme): string {
  const themeBase = theme.scopes?.base as
    | { primary?: { background?: string } }
    | undefined;
  if (themeBase?.primary?.background) return themeBase.primary.background;
  const fallback = theme.colorScheme === "dark" ? ThemeDark : ThemeLight;
  const fbBase = fallback.scopes.base as { primary: { background: string } };
  return fbBase.primary.background;
}

/**
 * Emit a `:root { --bc-*: <adjusted oklch>; … }` block for `theme`. Each
 * source static colour is adjusted for contrast against the theme background;
 * colours already meeting the target pass through unchanged. Returns an empty
 * string if the background cannot be resolved.
 */
export function blockColorizeToCSS(theme: VueTheme): string {
  const bg = resolveBackground(theme);
  if (!bg) return "";
  const lines: string[] = [];
  for (const [varName, sourceKey] of Object.entries(BLOCK_COLOR_SOURCES)) {
    const sourceHex = StaticColors[sourceKey];
    const adjusted = adjustForContrast(sourceHex, bg);
    lines.push(`  ${varName}: ${adjusted};`);
  }
  return `:root {\n${lines.join("\n")}\n}`;
}