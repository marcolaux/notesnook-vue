/**
 * Runtime theme injection. Composes the vendored `themeToCSS` (scoped color
 * vars) + glassmorphism vars + the Tailwind `:root` bridge into a single
 * `<style id="nn-theme">` element, and applies the base scope + color-scheme
 * to `<html>` so the vars cascade across the document.
 *
 * happy-dom-safe (used by the contract test).
 */
import type { VueTheme } from "./types";
import { themeToCSS } from "./theme-to-css";
import { glassmorphismToCSS } from "./glassmorphism";
import { tailwindBridgeToCSS } from "./tailwind-bridge";

const STYLE_ID = "nn-theme";

let current: VueTheme | undefined;

/**
 * Inject `theme` as the active theme. Idempotent: re-uses the same
 * `<style id="nn-theme">` element so `setTheme` at runtime just rewrites it.
 */
export function injectTheme(theme: VueTheme): void {
  const css = [
    themeToCSS(theme), // `.theme-scope-*` blocks (upstream byte format)
    glassmorphismToCSS(theme), // `:root { --nn-backdrop-blur; --nn-surface-opacity; }`
    tailwindBridgeToCSS() // `:root { --color-*: var(--<upstream>); --backdrop-blur-base: …; }`
  ].join("\n\n");

  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;

  // Apply the base scope + primary variant to <html> so the upstream `--<color>`
  // vars (and the `:root` bridge that references them) resolve document-wide.
  // Phase 3 adds `.theme-scope-<region>` to nested region roots.
  const html = document.documentElement;
  html.classList.add("theme-scope-base", "theme-scope-base-primary");
  html.setAttribute("data-theme", theme.id);
  html.style.colorScheme = theme.colorScheme; // native CSS color-scheme (UA widgets)

  current = theme;
}

/** Switch the active theme at runtime (Phase 3 settings UI). */
export function setTheme(theme: VueTheme): void {
  injectTheme(theme);
}

/** Returns the currently injected theme, if any. */
export function getCurrentTheme(): VueTheme | undefined {
  return current;
}