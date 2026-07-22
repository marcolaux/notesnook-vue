/**
 * Pure shortcuts logic — helpers for the shortcuts store that lists / pins /
 * unpins sidebar shortcuts via `db.shortcuts` (`@notesnook/core`). Kept
 * framework-agnostic so it is unit-tested in isolation
 * (see `tests/contract/shortcuts.spec.ts`). `useShortcutsStore` composes these.
 *
 * A `Shortcut` is a top-level Core collection item that pins a notebook or tag
 * to the sidebar's "Shortcuts" section (quick access). The shortcut's `id`
 * equals its `itemId` (core's `add` sets `id = shortcut.id || shortcut.itemId`),
 * so pin/unpin is keyed by the item id. Upstream's `ALLOWED_SHORTCUT_TYPES` is
 * `["notebook","topic","tag"]`; the vendored TS types constrain `itemType` to
 * `"tag" | "notebook"` (topics aren't rendered in our flat sidebar yet), so
 * this util exposes that narrower set.
 *
 * `sortIndex` is dead upstream (core's `add` hardcodes `-1`); ordering is by
 * `dateCreated` (see `resolved()`), so this util sorts by `dateCreated` and
 * does NOT implement reorder.
 */

import type { Shortcut, Notebook, Tag } from "@notesnook-vue/contracts";

/** Item types a shortcut can pin — the vendored TS subset (notebook | tag).
 *  Core's runtime also allows `"topic"` (sub-notebook), not rendered here. */
export const SHORTCUT_ITEM_TYPES = ["notebook", "tag"] as const;
export type ShortcutItemType = (typeof SHORTCUT_ITEM_TYPES)[number];

/** Input for pinning a shortcut via `db.shortcuts.add`. Only `itemId` +
 *  `itemType` are needed on create (core throws without them). */
export interface ShortcutInput {
  id?: string;
  itemId?: string;
  itemType?: ShortcutItemType;
  dateCreated?: number;
}

/** A resolved shortcut for the sidebar — the pinned notebook/tag, slim. */
export interface ResolvedShortcut {
  id: string;
  title: string;
  type: ShortcutItemType;
}

/**
 * Normalize a {@link ShortcutInput} into an `exactOptionalPropertyTypes`-safe
 * `Partial<Shortcut>` for `db.shortcuts.add`: returns a fresh object carrying
 * only the defined keys. Applies no defaults — core's `add` upserts by
 * itemId/id (the shortcut id = the item id) and throws without `itemId` +
 * `itemType` (caught in the store).
 */
export function buildShortcutInput(input: ShortcutInput): Partial<Shortcut> {
  const out: Partial<Shortcut> = {};
  if (input.id !== undefined) out.id = input.id;
  if (input.itemId !== undefined) out.itemId = input.itemId;
  if (input.itemType !== undefined) out.itemType = input.itemType;
  if (input.dateCreated !== undefined) out.dateCreated = input.dateCreated;
  return out;
}

/** Map a resolved `Notebook`/`Tag` (returned by `db.shortcuts.resolved()`) to
 *  the sidebar's {@link ResolvedShortcut} view. The BaseItem `type` field is
 *  the discriminator (`"notebook"` | `"tag"`). */
export function toResolvedShortcut(item: Notebook | Tag): ResolvedShortcut {
  return {
    id: item.id,
    title: item.title || "Untitled",
    type: item.type === "notebook" ? "notebook" : "tag"
  };
}

/**
 * Sort raw shortcuts by `dateCreated` ascending — the order `db.shortcuts
 * .resolved()` yields them in (core ignores `sortIndex`). Non-mutating, stable.
 */
export function sortShortcutsByCreated(shortcuts: readonly Shortcut[]): Shortcut[] {
  return [...shortcuts].sort((a, b) => a.dateCreated - b.dateCreated);
}

// --- shortcuts manual order (local-only, localStorage) ----------------------
/**
 * localStorage key for the sidebar's manual Shortcuts-section order. A JSON
 * array of row ids — a mix of notebook/tag ids (the `db.shortcuts` items) AND
 * note ids (the favourite-note rows the view merges into the section, since
 * upstream disallows notes as real shortcuts). Local-only: although
 * `sideBarOrder:shortcuts` IS an upstream-synced `SideBarSection`, it would
 * only round-trip the shortcut-item ids meaningfully; the foreign note ids make
 * a synced key divergent, so the whole merged section stays local (like the
 * notebooks order). `[]`/missing → no manual order (dateCreated + favourites
 * dateEdited-desc base order wins).
 */
export const SHORTCUT_ORDER_KEY = "notesnook.shortcutOrder";

/** Read the stored manual shortcut-section order, or `[]` on a miss/parse
 *  failure/missing localStorage. Never throws. */
export function readShortcutOrder(): string[] {
  try {
    const raw = localStorage.getItem(SHORTCUT_ORDER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed as string[];
    }
    return [];
  } catch {
    return [];
  }
}

/** Persist the manual shortcut-section order (a JSON id array). Best-effort. */
export function writeShortcutOrder(ids: string[]): void {
  try {
    localStorage.setItem(SHORTCUT_ORDER_KEY, JSON.stringify(ids));
  } catch {
    /* best-effort */
  }
}

/** Clear the stored manual shortcut-section order. */
export function clearShortcutOrder(): void {
  try {
    localStorage.removeItem(SHORTCUT_ORDER_KEY);
  } catch {
    /* best-effort */
  }
}