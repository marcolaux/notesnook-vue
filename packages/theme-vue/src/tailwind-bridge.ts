/**
 * Tailwind v4 token bridge.
 *
 * Two consumers:
 *  1. `style.css` carries a static `@theme inline { --color-surface: var(--background); … }`
 *     block (hand-written from this map) so Tailwind generates `bg-surface` /
 *     `text-text` / `border-border` etc. utilities that resolve to the upstream
 *     `--<color>` vars emitted by `themeToCSS` (provided at runtime under
 *     `.theme-scope-base-primary` on `<html>`).
 *  2. `tailwindBridgeToCSS()` emits a `:root { --color-*: var(--<upstream>); … }`
 *     block injected at runtime so existing hand-written `var(--color-*)` and
 *     `var(--backdrop-blur-base)` references in `style.css` (ProseMirror base,
 *     table decorations, `.tb-btn`, `.pop-*`) keep resolving with zero edits.
 *
 * Both `:root` and `.theme-scope-base-primary` land on `<html>`, so
 * `var(--background)` resolves on the same element — no cascade-direction issue.
 */

/** `[tailwindToken, upstreamVar]` pairs. Keep in sync with the `@theme inline` block in `style.css`. */
export const TAILWIND_TOKEN_MAP: ReadonlyArray<readonly [string, string]> = [
  ["--color-surface", "var(--background)"],
  ["--color-surface-solid", "var(--background)"],
  ["--color-bg", "var(--background)"],
  ["--color-text", "var(--paragraph)"],
  ["--color-text-muted", "var(--paragraph-secondary)"],
  ["--color-heading", "var(--heading)"],
  ["--color-border", "var(--border)"],
  ["--color-accent", "var(--accent)"],
  ["--color-accent-foreground", "var(--accentForeground)"],
  ["--color-placeholder", "var(--placeholder)"],
  ["--color-hover", "var(--hover)"],
  ["--color-separator", "var(--separator)"],
  ["--color-icon", "var(--icon)"],
  ["--color-backdrop", "var(--backdrop)"]
] as const;

/**
 * `:root` bridge: maps the `--color-*` names to upstream vars, and
 * `--backdrop-blur-base` to the glassmorphism `--nn-backdrop-blur` var.
 */
export function tailwindBridgeToCSS(): string {
  const lines = TAILWIND_TOKEN_MAP.map(([token, upstream]) => `  ${token}: ${upstream};`);
  lines.push("  --backdrop-blur-base: var(--nn-backdrop-blur);");
  return `:root {\n${lines.join("\n")}\n}`;
}