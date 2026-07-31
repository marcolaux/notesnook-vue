/**
 * Contrast-aware highlight text-colour CSS variable emitter.
 *
 * The editor's highlight mark (`<mark data-color="…">`, applied via
 * `@tiptap/extension-highlight` multicolor) paints a coloured background under
 * text. By default the text keeps the theme text colour (`color: inherit`), which
 * washes out on light highlights in dark themes (light text on yellow) and on
 * dark highlights in light themes (dark text on dark blue).
 *
 * This module emits a `:root { --hl-text-* }` block where each **preset**
 * highlight swatch's readable text colour has been OKLCH-lightness-adjusted
 * against the swatch colour to meet {@link CONTRAST_TARGET} (WCAG AA) — reusing
 * the exact engine ({@link adjustForContrast}) that
 * {@link blockColorizeToCSS} uses for the block-colorize palette. The consumer
 * (`apps/desktop/.../style.css`) maps `mark[data-color="<hex>"]` to the matching
 * `--hl-text-*` var.
 *
 * The preset swatches are a fixed, known set (`DefaultColors` == `StaticColors`),
 * so — like block-colorize's 14 static colours — they can be precomputed per
 * theme at injection time and recompute automatically on every theme switch
 * (`injectTheme` calls this). Custom (OS-picker) highlight colours are not
 * known here; they fall back to `color: inherit` in the consumer CSS.
 */
import type { VueTheme } from "./types";
import { ThemeDark, ThemeLight } from "./defaults";
import { StaticColors } from "./theme-to-css";
import { adjustForContrast } from "./color-contrast";

/** Maps each highlight text-colour CSS variable to its source `StaticColors`
 *  key (the preset swatch set, minus black/white). */
const HIGHLIGHT_TEXT_SOURCES = {
  "--hl-text-red": "red",
  "--hl-text-orange": "orange",
  "--hl-text-yellow": "yellow",
  "--hl-text-green": "green",
  "--hl-text-blue": "blue",
  "--hl-text-purple": "purple",
  "--hl-text-gray": "gray"
} as const satisfies Record<string, keyof typeof StaticColors>;

/** Resolve the editor text colour the same way `block-colorize.ts`'s
 *  `resolveBackground` resolves the background: theme base primary
 *  `paragraph`, falling back to the built-in for the colour scheme. The
 *  highlighted text sits on the highlight colour, so the theme text colour is
 *  the foreground we shift for contrast. */
function resolveText(theme: VueTheme): string {
  const themeBase = theme.scopes?.base as
    | { primary?: { paragraph?: string } }
    | undefined;
  if (themeBase?.primary?.paragraph) return themeBase.primary.paragraph;
  const fallback = theme.colorScheme === "dark" ? ThemeDark : ThemeLight;
  const fbBase = fallback.scopes.base as { primary: { paragraph: string } };
  return fbBase.primary.paragraph;
}

/**
 * Emit a `:root { --hl-text-*: <adjusted oklch>; … }` block for `theme`. Each
 * preset swatch colour becomes the *background*; the resolved theme text
 * colour is adjusted (OKLCH lightness only, hue + chroma preserved) to meet
 * {@link CONTRAST_TARGET} against it. Colours already meeting the target pass
 * through unchanged. Returns an empty string if the text colour cannot be
 * resolved.
 */
export function highlightToCSS(theme: VueTheme): string {
  const text = resolveText(theme);
  if (!text) return "";
  const lines: string[] = [];
  for (const [varName, sourceKey] of Object.entries(HIGHLIGHT_TEXT_SOURCES)) {
    const swatchHex = StaticColors[sourceKey];
    const adjusted = adjustForContrast(text, swatchHex);
    lines.push(`  ${varName}: ${adjusted};`);
  }
  return `:root {\n${lines.join("\n")}\n}`;
}