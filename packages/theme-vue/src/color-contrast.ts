/**
 * WCAG contrast + OKLCH lightness adjustment, dependency-free.
 *
 * Used by the block-colorize feature to keep the static Material palette
 * (`--*-static`, theme-invariant) readable on any theme background, including
 * 3rd-party catalog themes whose colours we don't know at build time. At
 * theme-inject time each block-colorize colour is measured against the resolved
 * theme background; if it falls below {@link CONTRAST_TARGET} its OKLCH
 * lightness is shifted (hue + chroma preserved) until the target is met, so the
 * colour stays the same *hue* but becomes legible. Colours already passing the
 * target are returned unchanged — the palette stays vibrant where it already
 * reads.
 *
 * Pure (no DOM) so it is happy-dom-safe for the contract tests.
 */

/** WCAG AA normal-text contrast ratio. One-line knob: drop to 3.0 (AA-large) to
 *  keep more vibrancy if the on-site check finds 4.5 too muddy on light themes. */
export const CONTRAST_TARGET = 4.5;

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface OKLCH {
  L: number;
  C: number;
  H: number; // degrees, 0..360
}

/** Parse a `#rgb`, `#rrggbb`, `rgb(r,g,b)` or `rgba(r,g,b,a)` string into RGB
 *  components in 0..255. Returns `null` for unparseable input. */
export function parseRGB(color: string): RGB | null {
  const s = color.trim();
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0]! + hex[0]!, 16);
      const g = parseInt(hex[1]! + hex[1]!, 16);
      const b = parseInt(hex[2]! + hex[2]!, 16);
      if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
      return { r, g, b };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
      return { r, g, b };
    }
    return null;
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m && m[1]) {
    const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
    if (
      parts.length >= 3 &&
      Number.isFinite(parts[0]!) &&
      Number.isFinite(parts[1]!) &&
      Number.isFinite(parts[2]!)
    ) {
      return { r: parts[0]!, g: parts[1]!, b: parts[2]! };
    }
  }
  return null;
}

/** Channel 0..255 → 0..1 sRGB. */
function toUnit(c: number): number {
  return c / 255;
}

/** WCAG sRGB channel linearization. Input 0..1. */
function lin(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0..1) of an RGB in 0..255. */
export function relativeLuminance(rgb: RGB): number {
  const r = lin(toUnit(rgb.r));
  const g = lin(toUnit(rgb.g));
  const b = lin(toUnit(rgb.b));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (1..21) between two RGB colours (0..255 each). */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// ── OKLCH (Björn Ottosson reference matrices) ──────────────────────────────

// linear sRGB → LMS
const M1 = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005]
];
// LMS' (cube-rooted) → OKLab
const M2 = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766]
];
// OKLab → LMS' (M2 inverse). Computed numerically from M2 (Ottosson's
// published values are the same to printed precision); the second/third rows
// are NOT a simple sign-flip of M2's rows — they are the true matrix inverse.
const M3 = [
  [1.0, 0.3963377774, 0.2158037573],
  [1.0, -0.1055613458, -0.0638541747],
  [1.0, -0.0894841775, -1.291485538]
];
// LMS → linear sRGB
const M4 = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684387156, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614675]
];

function dot3(m: number[][], v: [number, number, number]): [number, number, number] {
  const r0 = m[0]!;
  const r1 = m[1]!;
  const r2 = m[2]!;
  return [
    r0[0]! * v[0] + r0[1]! * v[1] + r0[2]! * v[2],
    r1[0]! * v[0] + r1[1]! * v[1] + r1[2]! * v[2],
    r2[0]! * v[0] + r2[1]! * v[1] + r2[2]! * v[2]
  ];
}

/** sRGB hex/rgb()/rgba() → OKLCH. Returns `null` if unparseable. */
export function srgbToOklch(color: string): OKLCH | null {
  const rgb = parseRGB(color);
  if (!rgb) return null;
  const r = lin(toUnit(rgb.r));
  const g = lin(toUnit(rgb.g));
  const b = lin(toUnit(rgb.b));
  const lms = dot3(M1, [r, g, b]);
  const lmsP: [number, number, number] = [
    Math.cbrt(lms[0]),
    Math.cbrt(lms[1]),
    Math.cbrt(lms[2])
  ];
  const lab = dot3(M2, lmsP);
  const L = lab[0];
  const a = lab[1];
  const bb = lab[2];
  const C = Math.sqrt(a * a + bb * bb);
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (!Number.isFinite(H)) H = 0;
  if (H < 0) H += 360;
  return { L, C, H };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** OKLCH → RGB in 0..255, with sRGB gamut clamping. */
export function oklchToSrgb({ L, C, H }: OKLCH): RGB {
  const hrad = (H * Math.PI) / 180;
  const a = C * Math.cos(hrad);
  const b = C * Math.sin(hrad);
  const lmsP = dot3(M3, [L, a, b]);
  const lms: [number, number, number] = [lmsP[0] ** 3, lmsP[1] ** 3, lmsP[2] ** 3];
  const linRgb = dot3(M4, lms);
  const toSrgb = (c: number): number => {
    const cl = clamp01(c);
    return cl <= 0.0031308 ? 12.92 * cl : 1.055 * Math.pow(cl, 1 / 2.4) - 0.055;
  };
  return {
    r: Math.round(clamp01(toSrgb(linRgb[0])) * 255),
    g: Math.round(clamp01(toSrgb(linRgb[1])) * 255),
    b: Math.round(clamp01(toSrgb(linRgb[2])) * 255)
  };
}

/** Format an OKLCH colour as a CSS `oklch()` string. */
export function oklchToCss({ L, C, H }: OKLCH): string {
  const Ls = L.toFixed(4);
  const Cs = C.toFixed(4);
  const Hs = H.toFixed(2);
  return `oklch(${Ls} ${Cs} ${Hs})`;
}

/**
 * Return `fgHex` adjusted — in OKLCH lightness only, hue + chroma preserved —
 * so its WCAG contrast against `bgHex` reaches `target` (default
 * {@link CONTRAST_TARGET}). If `fg` already meets the target it is returned
 * unchanged (as an `oklch()` string). If the target cannot be reached within
 * the safe lightness bounds `[0.02, 0.98]` (pure black/white would erase the
 * hue), the best-achievable bound is returned. Returns the original `fgHex`
 * string when the colour cannot be parsed (caller should keep the original).
 */
export function adjustForContrast(
  fgHex: string,
  bgHex: string,
  target: number = CONTRAST_TARGET
): string {
  const fg = parseRGB(fgHex);
  const bg = parseRGB(bgHex);
  if (!fg || !bg) return fgHex;
  const ok = srgbToOklch(fgHex);
  if (!ok) return fgHex;

  // Already passing → return unchanged (as oklch, same colour).
  if (contrastRatio(fg, bg) >= target) return oklchToCss(ok);

  // Walk OKLCH lightness toward a bound (darken or lighten), tracking the best
  // ratio seen — the curve can be non-monotonic near the gamut-clip bounds.
  const walk = (towardDark: boolean): { L: number; ratio: number } => {
    const step = 0.01;
    let bestL = ok.L;
    let bestRatio = contrastRatio(oklchToSrgb({ L: ok.L, C: ok.C, H: ok.H }), bg);
    let L = ok.L;
    for (let i = 0; i < 200; i++) {
      L = towardDark ? L - step : L + step;
      if (L < 0.02 || L > 0.98) {
        L = Math.min(0.98, Math.max(0.02, L));
        const r = contrastRatio(oklchToSrgb({ L, C: ok.C, H: ok.H }), bg);
        if (r > bestRatio) {
          bestL = L;
          bestRatio = r;
        }
        break;
      }
      const r = contrastRatio(oklchToSrgb({ L, C: ok.C, H: ok.H }), bg);
      if (r > bestRatio) {
        bestL = L;
        bestRatio = r;
      }
      if (r >= target) break;
    }
    return { L: bestL, ratio: bestRatio };
  };

  // Primary direction: move fg lightness AWAY from the background — darken on
  // light bg, lighten on dark bg. 0.5 cleanly separates the built-ins (white=1,
  // #181818≈0.018). Block-colorize's backgrounds are extreme, so this always
  // reaches the target there.
  const primaryDarken = relativeLuminance(bg) >= 0.5;
  const primary = walk(primaryDarken);
  if (primary.ratio >= target) {
    return oklchToCss({ L: primary.L, C: ok.C, H: ok.H });
  }

  // The primary direction couldn't reach the target. This happens with
  // mid-luminance backgrounds (e.g. the gray/orange highlight swatches) where
  // the heuristic points the wrong way: a light bg just under 0.5 tells the
  // fg to lighten, but the fg may already be light. Try the opposite direction
  // and keep whichever reaches a higher ratio.
  const secondary = walk(!primaryDarken);
  const best = secondary.ratio > primary.ratio ? secondary : primary;
  return oklchToCss({ L: best.L, C: ok.C, H: ok.H });
}