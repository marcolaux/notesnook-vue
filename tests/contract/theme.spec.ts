// @vitest-environment happy-dom
/**
 * Contract tests for `@notesnook-vue/theme-vue` (Phase 2.2 Tailwind-Token-Adapter).
 *
 * Locks:
 *  - `themeToCSS` byte-format (vendored port matches upstream `.theme-scope-*`
 *    output for the built-in themes).
 *  - `validateTheme` (vendored port) passes the built-ins and rejects `{}`.
 *  - Glassmorphism defaults + override emission.
 *  - `injectTheme` DOM effects + idempotent `<style id="nn-theme">` re-use.
 *  - `TAILWIND_TOKEN_MAP` shape.
 *
 * happy-dom provides `document` for the `injectTheme` assertions. CSS *variable
 * resolution* (`getComputedStyle`) is not asserted here — happy-dom's custom-
 * property resolution is incomplete; that is verified manually via `npm run dev`.
 */
import { describe, it, expect } from "vitest";
import {
  injectTheme,
  setTheme,
  getCurrentTheme,
  themeToCSS,
  validateTheme,
  ThemeDark,
  ThemeLight,
  TAILWIND_TOKEN_MAP,
  type ThemeDefinition,
  type VueTheme
} from "@notesnook-vue/theme-vue";

describe("themeToCSS — byte-format (vendored port)", () => {
  it("emits scoped `.theme-scope-*` blocks for ThemeDark with the verified values", () => {
    const css = themeToCSS(ThemeDark);
    expect(css).toContain(".theme-scope-base-primary {");
    expect(css).toContain("--accent: #008837;");
    expect(css).toContain("--background: #181818;");
    // Non-primary variants use the `-<variant>` suffix.
    expect(css).toContain(".theme-scope-base-secondary {");
    expect(css).toContain("--background-secondary: #202020;");
    // Aggregated per-scope block exists for every scope (list used as a sample).
    expect(css).toContain(".theme-scope-list {");
    // The synthetic `static` variant carries StaticColors as `--<name>-static`.
    expect(css).toContain(".theme-scope-base-static {");
    expect(css).toContain("--red-static: #f44336;");
  });

  it("emits the light theme background for ThemeLight", () => {
    const css = themeToCSS(ThemeLight);
    expect(css).toContain(".theme-scope-base-primary {");
    expect(css).toContain("--background: #ffffff;");
  });

  it("does not emit glassmorphism vars (those come from a separate emitter)", () => {
    expect(themeToCSS(ThemeDark)).not.toContain("--nn-backdrop-blur");
  });
});

describe("validateTheme — vendored schema validator", () => {
  it("passes the built-in themes", () => {
    expect(validateTheme(ThemeDark).error).toBeUndefined();
    expect(validateTheme(ThemeLight).error).toBeUndefined();
  });

  it("rejects an empty theme with a missing-keys error", () => {
    const result = validateTheme({} as Partial<ThemeDefinition>);
    expect(result.error).toBeTypeOf("string");
    expect(result.error).toContain("missing");
  });
});

describe("glassmorphism", () => {
  it("emits defaults when the theme has no `glassmorphism` field", () => {
    injectTheme(ThemeDark);
    const style = document.getElementById("nn-theme");
    expect(style).not.toBeNull();
    expect(style?.textContent).toContain("--nn-backdrop-blur: 24px;");
    expect(style?.textContent).toContain("--nn-surface-opacity: 65;");
  });

  it("honors an explicit glassmorphism override", () => {
    const themed: VueTheme = {
      ...ThemeDark,
      glassmorphism: { backdropBlur: "32px", surfaceOpacity: 80 }
    };
    injectTheme(themed);
    const style = document.getElementById("nn-theme");
    expect(style?.textContent).toContain("--nn-backdrop-blur: 32px;");
    expect(style?.textContent).toContain("--nn-surface-opacity: 80;");
  });
});

describe("injectTheme — DOM effects", () => {
  it("applies the base scope, data-theme, and color-scheme to <html>", () => {
    injectTheme(ThemeDark);
    const html = document.documentElement;
    expect(html.classList.contains("theme-scope-base")).toBe(true);
    expect(html.classList.contains("theme-scope-base-primary")).toBe(true);
    expect(html.getAttribute("data-theme")).toBe("default-dark");
    expect(html.style.colorScheme).toBe("dark");
    expect(getCurrentTheme()?.id).toBe("default-dark");
  });

  it("reuses the single <style id=\"nn-theme\"> when switching themes", () => {
    const before = document.getElementById("nn-theme");
    setTheme(ThemeLight);
    const after = document.getElementById("nn-theme");
    expect(after).not.toBeNull();
    expect(after).toBe(before); // same element, idempotent re-use
    expect(document.querySelectorAll('style[id="nn-theme"]')).toHaveLength(1);
    expect(document.documentElement.getAttribute("data-theme")).toBe("default-light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(getCurrentTheme()?.id).toBe("default-light");
  });
});

describe("Tailwind bridge", () => {
  it("injects the :root --color-* → upstream var bridge + backdrop-blur-base", () => {
    injectTheme(ThemeDark);
    const css = document.getElementById("nn-theme")?.textContent ?? "";
    expect(css).toContain("--color-surface: var(--background);");
    expect(css).toContain("--color-text: var(--paragraph);");
    expect(css).toContain("--color-accent: var(--accent);");
    expect(css).toContain("--backdrop-blur-base: var(--nn-backdrop-blur);");
  });

  it("TAILWIND_TOKEN_MAP is well-formed", () => {
    expect(TAILWIND_TOKEN_MAP.length).toBeGreaterThan(0);
    for (const [token, upstream] of TAILWIND_TOKEN_MAP) {
      expect(token.startsWith("--color-")).toBe(true);
      expect(upstream.startsWith("var(--")).toBe(true);
    }
  });
});