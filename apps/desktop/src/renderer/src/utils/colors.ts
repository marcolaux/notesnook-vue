/**
 * Pure colors logic — helpers for the colors store that lists / creates /
 * deletes note colors via `db.colors` (`@notesnook/core`). Kept framework-
 * agnostic so it is unit-tested in isolation (see `tests/contract/colors.spec.ts`).
 * `useColorsStore` composes these.
 *
 * A `Color` is a top-level Core collection item (the "colors" sidebar section +
 * a note-grouping key): a `{ title, colorCode }` pair. Colors are attached to
 * notes via `db.relations` (the deprecated `Note.color` field is migration-only),
 * so note-color *assignment* is a properties-panel concern — this util + store
 * manage the color collection itself (list / create / delete + per-color note
 * count).
 *
 * `db.colors.add` upserts (finds an existing color by `id` or `colorCode`, then
 * updates; else creates) and throws if `title`/`colorCode` is missing after the
 * merge — so this util does **not** default them; its only job is to build an
 * `exactOptionalPropertyTypes`-safe `Partial<Color>` by stripping `undefined`
 * keys before they reach core.
 */

import type { Color } from "@notesnook-vue/contracts";

/**
 * Input for creating or editing a color via `db.colors.add`. On create both
 * `title` + `colorCode` are required (core throws otherwise); on edit, `id`
 * (or `colorCode` to find an existing color) plus the changed fields.
 */
export interface ColorInput {
  id?: string;
  title?: string;
  colorCode?: string;
  dateCreated?: number;
}

/** Slim view of a color for the sidebar / picker. */
export interface ColorListItem {
  id: string;
  title: string;
  colorCode: string;
}

/**
 * Normalize a {@link ColorInput} into an `exactOptionalPropertyTypes`-safe
 * `Partial<Color>` for `db.colors.add`: returns a fresh object carrying only
 * the keys whose value is not `undefined`. Applies no defaults — core's `add`
 * upserts by id/colorCode and throws on a missing title/colorCode (caught in
 * the store). Used both for creates and edits.
 */
export function buildColorInput(input: ColorInput): Partial<Color> {
  const out: Partial<Color> = {};
  if (input.id !== undefined) out.id = input.id;
  if (input.title !== undefined) out.title = input.title;
  if (input.colorCode !== undefined) out.colorCode = input.colorCode;
  if (input.dateCreated !== undefined) out.dateCreated = input.dateCreated;
  return out;
}

/** Map a `Color` to the sidebar / picker {@link ColorListItem} view. */
export function toColorListItem(c: Color): ColorListItem {
  return {
    id: c.id,
    title: c.title || "Untitled",
    colorCode: c.colorCode
  };
}

/**
 * Sort colors by `title` ascending (case-insensitive), non-mutating, stable.
 * The default order for the sidebar's colors section + the color picker.
 */
export function sortColorsByTitle(colors: readonly Color[]): Color[] {
  return [...colors].sort((a, b) => {
    const ta = (a.title || "").toLowerCase();
    const tb = (b.title || "").toLowerCase();
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  });
}