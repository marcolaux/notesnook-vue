/**
 * Theme preview helpers — a vendored port of upstream `getPreviewColors`
 * (`packages/theme/src/theme-engine/utils.ts`) plus the theme compatibility
 * version constant. Pure, no DOM.
 */
import type { VueTheme, PreviewColors } from "./types";
import { deriveShadeColor } from "./theme-to-css";

/**
 * The theme compatibility version the themes server and built-in themes are
 * pinned to. Matches `compatibilityVersion` on `ThemeDark`/`ThemeLight` in
 * `./defaults` (vendored from `@notesnook/theme@2.1.3`). Sent to the themes
 * catalog API so it returns themes for the right schema version.
 */
export const THEME_COMPATIBILITY_VERSION = 1 as const;

/**
 * Derive a reduced `PreviewColors` set from a theme's scopes for rendering a
 * theme preview card. Every value falls back to `base.primary.*` (or
 * `base.success.icon` for the status-bar icon) when the scope is missing, so
 * this is safe to call on a theme that only populates `base` (or even on a
 * `ThemeMetadata` list item, which carries `scopes` stripped — but the list
 * items already ship a server-computed `previewColors`, so this is mainly used
 * to compute previews locally for the two installed built-in themes and for
 * file-imported themes).
 */
export function getPreviewColors(theme: VueTheme): PreviewColors {
  const { base, navigationMenu, statusBar, list, editor } = theme.scopes;
  const { primary, success } = base;

  return {
    navigationMenu: {
      shade: deriveShadeColor(navigationMenu?.primary?.accent || primary.accent),
      accent: navigationMenu?.primary?.accent || primary.accent,
      background: navigationMenu?.primary?.background || primary.background,
      icon: navigationMenu?.primary?.icon || primary.icon
    },
    statusBar: {
      paragraph: statusBar?.primary?.paragraph || primary.paragraph,
      background: statusBar?.primary?.background || primary.background,
      icon: statusBar?.success?.icon || success.icon
    },
    editor: editor?.primary?.background || primary.background,
    list: {
      heading: list?.primary?.heading || primary.heading,
      background: list?.primary?.background || primary.background,
      accent: list?.primary?.accent || primary.accent,
      accentForeground: list?.primary?.accentForeground || primary.accentForeground
    },
    border: primary.border,
    paragraph: primary.paragraph,
    background: primary.background,
    accent: primary.accent,
    accentForeground: primary.accentForeground
  };
}