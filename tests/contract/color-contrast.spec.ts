/**
 * Contract tests for `@notesnook-vue/theme-vue` color-contrast + block-colorize
 * emitters (`packages/theme-vue/src/color-contrast.ts` +
 * `block-colorize.ts`).
 *
 * Locks the WCAG math (known pairs), the OKLCH round-trip, and the
 * contrast-adjustment contract: a sub-target colour is shifted in lightness
 * (hue preserved) until it meets the target, while a colour already passing
 * is returned unchanged. Also locks that `blockColorizeToCSS` emits the
 * `--bc-*` palette for both built-in themes with the expected direction
 * (yellow darkened on light bg, purple lifted on dark bg).
 */
import { describe, it, expect } from "vitest";
import {
  contrastRatio,
  relativeLuminance,
  parseRGB,
  srgbToOklch,
  oklchToSrgb,
  adjustForContrast,
  blockColorizeToCSS,
  CONTRAST_TARGET,
  ThemeDark,
  ThemeLight
} from "@notesnook-vue/theme-vue";

describe("parseRGB", () => {
  it("parses #rgb, #rrggbb, rgb(), rgba()", () => {
    expect(parseRGB("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseRGB("#FFD600")).toEqual({ r: 255, g: 214, b: 0 });
    expect(parseRGB("rgb(0, 0, 0)")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseRGB("rgba(1,2,3,0.5)")).toEqual({ r: 1, g: 2, b: 3 });
  });
  it("returns null for unparseable input", () => {
    expect(parseRGB("var(--x)")).toBeNull();
    expect(parseRGB("#zzz")).toBeNull();
  });
});

describe("relativeLuminance + contrastRatio", () => {
  it("black/white ratio is 21", () => {
    expect(contrastRatio(parseRGB("#000")!, parseRGB("#fff")!)).toBeCloseTo(21, 0);
  });
  it("a colour against itself is 1", () => {
    const c = parseRGB("#FFD600")!;
    expect(contrastRatio(c, c)).toBeCloseTo(1, 5);
  });
  it("yellow on white is far below AA", () => {
    const r = contrastRatio(parseRGB("#FFD600")!, parseRGB("#ffffff")!);
    expect(r).toBeLessThan(1.5);
    expect(r).toBeLessThan(CONTRAST_TARGET);
  });
  it("dark purple on the dark editor bg is below AA", () => {
    const r = contrastRatio(parseRGB("#673AB7")!, parseRGB("#181818")!);
    expect(r).toBeLessThan(3);
    expect(r).toBeLessThan(CONTRAST_TARGET);
  });
});

describe("srgbToOklch / oklchToSrgb round-trip", () => {
  it("round-trips a vivid colour within 2/255 per channel", () => {
    const ok = srgbToOklch("#2196F3")!;
    const back = oklchToSrgb(ok);
    const orig = parseRGB("#2196F3")!;
    expect(Math.abs(back.r - orig.r)).toBeLessThanOrEqual(2);
    expect(Math.abs(back.g - orig.g)).toBeLessThanOrEqual(2);
    expect(Math.abs(back.b - orig.b)).toBeLessThanOrEqual(2);
  });
  it("achromatic gray yields near-zero chroma", () => {
    const ok = srgbToOklch("#9E9E9E")!;
    expect(ok.C).toBeLessThan(0.01);
  });
});

describe("adjustForContrast", () => {
  it("returns an oklch() string meeting the target for yellow on white", () => {
    const out = adjustForContrast("#FFD600", "#ffffff", 4.5);
    expect(out.startsWith("oklch(")).toBe(true);
    // Parse the L/C/H from the emitted string and verify contrast via the inverse.
    const m = out.match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/)!;
    const rgb = oklchToSrgb({
      L: parseFloat(m[1]!),
      C: parseFloat(m[2]!),
      H: parseFloat(m[3]!)
    });
    expect(contrastRatio(rgb, parseRGB("#ffffff")!)).toBeGreaterThanOrEqual(4.5);
  });

  it("darkens yellow on a light background (L reduced, hue preserved)", () => {
    const src = srgbToOklch("#FFD600")!;
    const out = adjustForContrast("#FFD600", "#ffffff", 4.5);
    const m = out.match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/)!;
    const adj = { L: parseFloat(m[1]!), C: parseFloat(m[2]!), H: parseFloat(m[3]!) };
    expect(adj.L).toBeLessThan(src.L); // darker
    // Hue band preserved (yellow ≈ 90°–105° in OKLCH).
    expect(adj.H).toBeGreaterThan(80);
    expect(adj.H).toBeLessThan(115);
  });

  it("lifts dark purple on a dark background to meet the target", () => {
    const out = adjustForContrast("#673AB7", "#181818", 4.5);
    const m = out.match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/)!;
    const rgb = oklchToSrgb({
      L: parseFloat(m[1]!),
      C: parseFloat(m[2]!),
      H: parseFloat(m[3]!)
    });
    expect(contrastRatio(rgb, parseRGB("#181818")!)).toBeGreaterThanOrEqual(4.5);
    expect(parseFloat(m[1]!)).toBeGreaterThan(srgbToOklch("#673AB7")!.L); // lighter
  });

  it("leaves a colour already passing the target unchanged", () => {
    // Dark purple on white already passes 4.5 — the source L must be preserved.
    const src = srgbToOklch("#673AB7")!;
    const out = adjustForContrast("#673AB7", "#ffffff", 4.5);
    const m = out.match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/)!;
    expect(parseFloat(m[1]!)).toBeCloseTo(src.L, 3);
    expect(parseFloat(m[2]!)).toBeCloseTo(src.C, 3);
  });

  it("falls back to the input string when the colour is unparseable", () => {
    expect(adjustForContrast("var(--x)", "#ffffff")).toBe("var(--x)");
  });
});

describe("blockColorizeToCSS", () => {
  it("emits a :root block with every --bc-* var for the light theme", () => {
    const css = blockColorizeToCSS(ThemeLight);
    expect(css.startsWith(":root {")).toBe(true);
    for (const v of [
      "--bc-heading",
      "--bc-bold",
      "--bc-italic",
      "--bc-link",
      "--bc-list-1",
      "--bc-list-2",
      "--bc-list-3",
      "--bc-list-4",
      "--bc-list-5",
      "--bc-code-keyword",
      "--bc-code-string",
      "--bc-code-comment",
      "--bc-code-function",
      "--bc-code-number"
    ]) {
      expect(css).toContain(`${v}:`);
    }
  });

  it("darkens the heading (yellow) on the light theme", () => {
    const css = blockColorizeToCSS(ThemeLight);
    const m = css.match(/--bc-heading: oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/)!;
    const adjL = parseFloat(m[1]!);
    expect(adjL).toBeLessThan(srgbToOklch("#FFD600")!.L);
  });

  it("lifts the link (purple) on the dark theme", () => {
    const css = blockColorizeToCSS(ThemeDark);
    const m = css.match(/--bc-link: oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/)!;
    const adjL = parseFloat(m[1]!);
    expect(adjL).toBeGreaterThan(srgbToOklch("#673AB7")!.L);
  });

  it("every emitted colour meets the target against its theme background", () => {
    for (const [theme, bg] of [
      [ThemeLight, "#ffffff"],
      [ThemeDark, "#181818"]
    ] as const) {
      const css = blockColorizeToCSS(theme);
      const matches = [...css.matchAll(/--bc-[a-z0-9-]+: oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/g)];
      expect(matches.length).toBe(14);
      for (const mm of matches) {
        const rgb = oklchToSrgb({
          L: parseFloat(mm[1]!),
          C: parseFloat(mm[2]!),
          H: parseFloat(mm[3]!)
        });
        expect(contrastRatio(rgb, parseRGB(bg)!)).toBeGreaterThanOrEqual(
          CONTRAST_TARGET - 0.05 // tolerate a rounding/clip edge
        );
      }
    }
  });
});