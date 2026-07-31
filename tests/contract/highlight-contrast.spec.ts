/**
 * Contract tests for `@notesnook-vue/theme-vue`'s highlight text-colour emitter
 * (`packages/theme-vue/src/highlight.ts` → `highlightToCSS`).
 *
 * Locks the contract that every preset highlight swatch gets a readable text
 * colour meeting WCAG AA ({@link CONTRAST_TARGET}) against the swatch
 * background, for both built-in themes — reusing the same OKLCH/WCAG engine
 * (`adjustForContrast`) as block-colorize. Mirrors the `blockColorizeToCSS`
 * tests in `color-contrast.spec.ts`.
 */
import { describe, it, expect } from "vitest";
import {
  highlightToCSS,
  contrastRatio,
  parseRGB,
  oklchToSrgb,
  srgbToOklch,
  CONTRAST_TARGET,
  StaticColors,
  ThemeDark,
  ThemeLight
} from "@notesnook-vue/theme-vue";

/** Preset swatch hexes — `DefaultColors` == `StaticColors` (the values the
 *  editor writes into `mark[data-color]` and that `style.css` selects on). */
const PRESETS: Record<string, string> = {
  "--hl-text-red": StaticColors.red,
  "--hl-text-orange": StaticColors.orange,
  "--hl-text-yellow": StaticColors.yellow,
  "--hl-text-green": StaticColors.green,
  "--hl-text-blue": StaticColors.blue,
  "--hl-text-purple": StaticColors.purple,
  "--hl-text-gray": StaticColors.gray
};

/** Parse the oklch() value of `varName` out of an emitted CSS block. */
function oklchVar(css: string, varName: string) {
  const m = css.match(
    new RegExp(`${varName}: oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`)
  )!;
  return {
    L: parseFloat(m[1]!),
    C: parseFloat(m[2]!),
    H: parseFloat(m[3]!)
  };
}

/** Resolve the editor text colour for a built-in theme (mirrors
 *  `highlight.ts`'s `resolveText`). */
function themeText(theme: typeof ThemeDark): string {
  const base = theme.scopes.base as unknown as { primary: { paragraph: string } };
  return base.primary.paragraph;
}

describe("highlightToCSS", () => {
  it("emits a :root block with every --hl-text-* var for both themes", () => {
    for (const theme of [ThemeLight, ThemeDark]) {
      const css = highlightToCSS(theme);
      expect(css.startsWith(":root {")).toBe(true);
      for (const v of Object.keys(PRESETS)) {
        expect(css).toContain(`${v}:`);
      }
    }
  });

  it("every emitted text colour meets the target against its swatch background", () => {
    for (const theme of [ThemeLight, ThemeDark]) {
      const css = highlightToCSS(theme);
      for (const [varName, swatchHex] of Object.entries(PRESETS)) {
        const rgb = oklchToSrgb(oklchVar(css, varName));
        // The text colour must be readable against the highlight swatch.
        expect(contrastRatio(rgb, parseRGB(swatchHex)!)).toBeGreaterThanOrEqual(
          CONTRAST_TARGET - 0.05 // tolerate a rounding/clip edge
        );
      }
    }
  });

  it("darkens the text for the yellow swatch on the dark theme (light text)", () => {
    const css = highlightToCSS(ThemeDark);
    const adjL = oklchVar(css, "--hl-text-yellow").L;
    expect(adjL).toBeLessThan(srgbToOklch(themeText(ThemeDark))!.L);
  });

  it("lightens the text for the purple swatch on the light theme (dark text)", () => {
    const css = highlightToCSS(ThemeLight);
    const adjL = oklchVar(css, "--hl-text-purple").L;
    expect(adjL).toBeGreaterThan(srgbToOklch(themeText(ThemeLight))!.L);
  });

  it("leaves an already-passing text colour unchanged (dark text on yellow, light theme)", () => {
    // #505050 on #FFD600 already passes 4.5 → source L preserved.
    const src = srgbToOklch(themeText(ThemeLight))!;
    const css = highlightToCSS(ThemeLight);
    const adjL = oklchVar(css, "--hl-text-yellow").L;
    expect(adjL).toBeCloseTo(src.L, 3);
  });
});