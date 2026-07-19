/**
 * Glassmorphism style helper.
 *
 * Produces an inline `style` object reading the theme CSS vars emitted by
 * `@notesnook-vue/theme-vue`'s `injectTheme`:
 *   - `--backdrop-blur-base` (bridged from `--nn-backdrop-blur`, default 24px)
 *   - `--nn-surface-opacity` (0–100, default 65)
 *   - `--background` (the surface color)
 *
 * Reading the vars inline (rather than emitting Tailwind classes) avoids a
 * `style.css` change and works in both the real browser and happy-dom (which
 * can't resolve custom props via `getComputedStyle`, but can hold them in
 * inline `style` text for contract-test assertions).
 */
import type { CSSProperties } from "vue";

export function glassStyle(opts: { blur?: boolean; opacity?: boolean } = {}): CSSProperties | undefined {
  const blur = opts.blur ?? true;
  const opacity = opts.opacity ?? true;
  if (!blur && !opacity) return undefined;
  const style: CSSProperties = {};
  if (blur) {
    // Chromium (Electron 43+) supports unprefixed `backdrop-filter`.
    style.backdropFilter = "blur(var(--backdrop-blur-base))";
  }
  if (opacity) {
    style.background =
      "color-mix(in srgb, var(--background) calc(var(--nn-surface-opacity) * 1%), transparent)";
  }
  return style;
}