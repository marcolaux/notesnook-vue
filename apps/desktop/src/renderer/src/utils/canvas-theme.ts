/**
 * Theme-token bridge for 2D `<canvas>` rendering.
 *
 * The app's colors live as CSS custom properties on `<html>` (`--background`,
 * `--paragraph`, `--accent`, …), injected at runtime by
 * `@notesnook-vue/theme-vue`'s `injectTheme` (which applies
 * `.theme-scope-base-primary` to `documentElement`). Vue/Tailwind utilities
 * consume them via the `@theme inline` bridge in `style.css`, but a 2D canvas
 * context can't resolve `var(…)` — it needs a concrete color string. These
 * helpers read the resolved token values from the computed style on
 * `documentElement` and hand back hex/rgba strings ready for `ctx.fillStyle` /
 * `ctx.strokeStyle`, so a canvas surface follows the active theme (light/dark
 * + custom catalog themes) just like the rest of the shell.
 *
 * Re-read per render frame (cheap: one `getComputedStyle`) and re-render on
 * theme change via `onThemeChange`.
 */

/** Canvas-relevant theme color tokens, resolved to concrete color strings. */
export interface CanvasThemeColors {
  /** App surface background (flips with the theme) — canvas backdrop. */
  backdrop: string;
  /** Primary text color — labels, high-contrast rings. */
  text: string;
  /** Secondary/muted text — dimmed/unrelated labels, neutral edges. */
  textMuted: string;
  /** Theme border/separator — neutral strokes. */
  border: string;
  /** Accent color — selection + active highlight. */
  accent: string;
}

/** Fallbacks (dark theme defaults) if a token is missing or unreadable. */
const FALLBACK: CanvasThemeColors = {
  backdrop: "#181818",
  text: "#D3D3D3",
  textMuted: "#818589",
  border: "#2b2b2b",
  accent: "#008837"
};

function readToken(name: string, fallback: string): string {
  if (typeof window === "undefined" || !document) return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value.length > 0 ? value : fallback;
}

/**
 * Resolve the active theme's canvas-relevant color tokens from `<html>`'s
 * computed style. Safe in happy-dom (used by the contract test) and in the
 * renderer; returns the dark-theme fallbacks under SSR (`window` undefined).
 */
export function readCanvasThemeColors(): CanvasThemeColors {
  return {
    backdrop: readToken("--background", FALLBACK.backdrop),
    text: readToken("--paragraph", FALLBACK.text),
    textMuted: readToken("--paragraph-secondary", FALLBACK.textMuted),
    border: readToken("--border", FALLBACK.border),
    accent: readToken("--accent", FALLBACK.accent)
  };
}

/** Parsed RGB components of a color. */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse a `#rgb`, `#rrggbb`, `rgb(r,g,b)` or `rgba(r,g,b,a)` string into RGB
 * components. Returns `null` for unparseable input (caller should keep the
 * original color string).
 */
export function parseRGB(color: string): RGB | null {
  const s = color.trim();
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0]! + hex[0]!, 16),
        g: parseInt(hex[1]! + hex[1]!, 16),
        b: parseInt(hex[2]! + hex[2]!, 16)
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16)
      };
    }
    return null;
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m && m[1]) {
    const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
    if (parts.length >= 3 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && Number.isFinite(parts[2])) {
      return { r: parts[0]!, g: parts[1]!, b: parts[2]! };
    }
  }
  return null;
}

/**
 * Return `color` as an `rgba(r,g,b,alpha)` string. Falls back to the original
 * color if it can't be parsed (e.g. an already-`rgba` value or a `var(…)`),
 * so callers can pass a token straight through without a guard.
 */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseRGB(color);
  return rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : color;
}

/**
 * Invoke `cb` whenever the active theme changes. `injectTheme`/`setTheme`
 * rewrite `<html data-theme="…">` on every theme switch (themeMode
 * light/dark/system, darkTheme/lightTheme swap, catalog install, cross-window
 * sync), so observing that attribute catches all color-affecting changes
 * without coupling to the settings store. Use to trigger a canvas re-render so
 * colors follow the theme live. Returns a teardown function (no-op if
 * `MutationObserver` is unavailable, e.g. SSR).
 */
export function onThemeChange(cb: () => void): () => void {
  if (typeof window === "undefined" || !("MutationObserver" in window)) return () => {};
  const obs = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "attributes") {
        cb();
        return;
      }
    }
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}