/**
 * Full Lucide icon set — the ENTIRE `@lucide/vue` namespace, built on demand.
 *
 * This module is imported ONLY dynamically (via `loadAllIcons()` in
 * `./icon-registry.ts`), so the bundler puts it — and the full `@lucide/vue`
 * namespace it imports — into a SEPARATE LAZY CHUNK. That keeps the ~580-icon
 * set (~1.1 MB) out of the main renderer bundle; it is fetched only when the
 * icon picker opens, or when a stored notebook icon needs a glyph that isn't
 * in the static curated set.
 *
 * The static curated set (the ~48 icons app chrome uses at first paint) lives
 * in `./icon-registry.ts` as tree-shakeable named imports; this module is the
 * on-demand superset.
 *
 * Derivation: skip non-icon exports (`icons`, `createLucideIcon`, `Icon`,
 * `default`, `defaultAttributes`, `context`) + the alias forms (keys ending in
 * `Icon` = `BookIcon`, keys starting with `Lucide` = `LucideBook`), kebab-
 * convert the rest, dedupe (first wins). Lucide plain alias names (e.g.
 * `SortDesc` for `ArrowDownWideNarrow`) pass the filter → extra searchable
 * keys rendering the same glyph.
 */
import type { Component } from "vue";
import * as LucideIcons from "@lucide/vue";

/** Non-icon value exports in the `@lucide/vue` namespace — not glyphs. */
const NON_ICONS = new Set<string>([
  "icons",
  "createLucideIcon",
  "Icon",
  "default",
  "defaultAttributes",
  "context"
]);

/**
 * Convert a PascalCase Lucide component name to kebab-case. Inserts a hyphen
 * at lowercase→uppercase (`ArrowDown` → `Arrow-Down`) and letter→digit
 * (`Trash2` → `Trash-2`, `FileCode2` → `File-Code-2`) boundaries, then lower-
 * cases. Consecutive capitals collapse (`ArrowDownAZ` → `arrow-down-az`). */
export function toKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Za-z])(\d)/g, "$1-$2")
    .toLowerCase();
}

/**
 * Build the full kebab→component map from the `@lucide/vue` namespace. Pure —
 * called once by `loadAllIcons()` after the dynamic import resolves. */
export function buildAllIcons(): Record<string, Component> {
  const icons: Record<string, Component> = {};
  for (const [key, value] of Object.entries(LucideIcons)) {
    if (NON_ICONS.has(key)) continue;
    if (key.endsWith("Icon") || key.startsWith("Lucide")) continue;
    const name = toKebab(key);
    if (!icons[name]) icons[name] = value as Component;
  }
  return icons;
}