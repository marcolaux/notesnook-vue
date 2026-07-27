import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import type { Color } from "@notesnook-vue/contracts";
import {
  buildColorInput,
  sortColorsByTitle,
  readColorFavorites,
  writeColorFavorites,
  type ColorInput
} from "@/utils/colors";
import { applyManualOrder, moveIdTo } from "@/utils/sidebar-order";
import { logger } from "@/utils/logger";
import i18n from "@/i18n";

const t = i18n.global.t.bind(i18n.global);

/**
 * Colors store (headless) — the color collection for the sidebar's "colors"
 * section + the note-color picker: list / create / delete colors and a per-
 * color note count, backed by `@notesnook/core`'s `db.colors`.
 *
 * A `Color` is a top-level collection item (`{ title, colorCode }`). Colors are
 * attached to notes via `db.relations` (the deprecated `Note.color` field is
 * migration-only), so note-color *assignment* lives in the properties store
 * (like tag/notebook assignment) — this store manages the collection itself.
 *
 * Request/response (no event-subscribe, like the reminders / sync-control
 * stores) → isolated testable. `db.colors.add` upserts by id/colorCode (finds
 * an existing color, then updates; else creates) and throws on a missing
 * title/colorCode — caught here into `lastError`. The sidebar loads `refresh()`
 * on mount; note-color assignment + the picker UI are on-site follow-ups.
 */

/**
 * Palette cycled for freshly created colors (the Colors section header `+`).
 * `db.colors.add` upserts by id **or colorCode** — a duplicate colorCode would
 * update the existing color instead of creating one — so each new color gets
 * the first code from this list not already in use (then a hue-nudged fallback
 * if the whole palette is used). The title is renamed inline immediately after;
 * the swatch is editable later via the color editor.
 */
const NEW_COLOR_PALETTE = [
  "#5b8def",
  "#22c55e",
  "#ef4444",
  "#f59e0b",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#64748b",
  "#eab308",
  "#0ea5e9"
];

/**
 * Nudge a `#rrggbb` color's hue by `step` sixteenths of a turn (a cheap HSL-ish
 * rotation on the RGB channels) to derive a distinct fallback code when the
 * whole {@link NEW_COLOR_PALETTE} is already in use. Returns a valid `#rrggbb`.
 */
function nudgeHue(hex: string, step: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // rotate the channels by `step` positions (3-cycle keeps it valid + distinct).
  const rot = ((step % 3) + 3) % 3;
  const [nr, ng, nb] =
    rot === 1 ? [g, b, r] : rot === 2 ? [b, r, g] : [r, g, b];
  const h = (v: number) => v.toString(16).padStart(2, "0");
  return `#${h(nr)}${h(ng)}${h(nb)}`;
}

export const useColorsStore = defineStore("colors", () => {
  /** All colors, title-ascending then manual-order overlay (see `order`). */
  const items = ref<Color[]>([]);
  /** Manual sidebar order of color ids (upstream `sideBarOrder:colors`). Empty
   *  → title sort wins. Loaded in `refresh`, persisted by `setOrder`. */
  const order = ref<string[]>([]);
  /** Favorited color ids (local-only, `localStorage` — NOT `db.shortcuts`;
   *  upstream disallows colors as shortcuts). Insertion order preserved.
   *  Pruned in `refresh` so a deleted color drops out of the Shortcuts section. */
  const favoriteIds = ref<string[]>([]);
  /** O(1) lookup for the color-row fav active-state. */
  const favoriteIdSet = computed(() => new Set(favoriteIds.value));
  /** True while the list is being (re)loaded. */
  const loading = ref(false);
  /** True while a create/delete mutation is in flight. */
  const busy = ref(false);
  /** Last mutation error message, or `null`. Cleared on success. */
  const lastError = ref<string | null>(null);

  const count = computed(() => items.value.length);

  /** Favorited colors as Shortcuts-section rows (merged into the Shortcuts
   *  section at the view layer, like favourite notes). Carries `colorCode` so
   *  the row renders the color swatch. Insertion order; deleted colors (ids no
   *  longer in `items`) are skipped — `refresh` prunes them from storage. */
  const favorites = computed(() =>
    favoriteIds.value
      .map((id) => items.value.find((c) => c.id === id))
      .filter((c): c is Color => Boolean(c))
      .map((c) => ({
        id: c.id,
        title: c.title || "Untitled",
        type: "color" as const,
        colorCode: c.colorCode
      }))
  );

  /** Reload the color list from the database, title-ascending then the stored
   *  manual order (`db.settings.getSideBarOrder("colors")`). Empty order →
   *  title sort wins. Never throws — a failure leaves the previous list. */
  async function refresh(): Promise<void> {
    loading.value = true;
    try {
      const db = getDatabase();
      const [all, storedOrder] = await Promise.all([
        db.colors.all.items() as Promise<Color[]>,
        db.settings.getSideBarOrder("colors") as string[] | undefined
      ]);
      order.value = storedOrder ?? [];
      items.value = applyManualOrder(sortColorsByTitle(all), order.value);
      // Load the local-only color favorites, then prune ids whose color no
      // longer exists (deleted) so the Shortcuts section doesn't hold ghost
      // rows. Persist the pruned set if it changed.
      const stored = readColorFavorites();
      const live = new Set(items.value.map((c) => c.id));
      const pruned = stored.filter((id) => live.has(id));
      favoriteIds.value = pruned;
      if (pruned.length !== stored.length) writeColorFavorites(pruned);
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[colors] refresh failed:", e);
    } finally {
      loading.value = false;
    }
  }

  /** Is the given color id favorited? Sync, never throws. */
  function isFavoriteColor(id: string): boolean {
    return favoriteIdSet.value.has(id);
  }

  /** Favorite / unfavorite a color (local-only, `localStorage`). Toggles
   *  membership, persists, and updates `favorites` reactively. Never throws. */
  function toggleFavoriteColor(id: string): void {
    if (!id) return;
    const next = favoriteIdSet.value.has(id)
      ? favoriteIds.value.filter((x) => x !== id)
      : [...favoriteIds.value, id];
    favoriteIds.value = next;
    writeColorFavorites(next);
  }

  /**
   * Persist a full manual order of color ids via
   * `db.settings.setSideBarOrder("colors", ids)` (synced through upstream),
   * store it, and re-apply it over the current items. Pass `[]` to reset to
   * the title sort. The component computes the desired id sequence from a
   * drop and passes it wholesale. Never throws — a failure logs + leaves the
   * previous order.
   */
  async function setOrder(ids: string[]): Promise<void> {
    try {
      const db = getDatabase();
      await db.settings.setSideBarOrder("colors", ids);
      order.value = ids;
      // Re-derive from the title-sorted base so a reset to [] restores title
      // order (applying over the already-manual list would otherwise freeze
      // the previous manual order).
      items.value = applyManualOrder(sortColorsByTitle(items.value), ids);
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[colors] setOrder failed:", e);
    }
  }

  /**
   * Move `fromId` to a position relative to `toId` (`before` → immediately
   * ahead, else immediately after) in the displayed color order, then persist
   * the resulting full id sequence via {@link setOrder}. The sidebar color-row
   * drop handler calls this. No-op when `from`/`to` are missing or equal.
   */
  async function moveBefore(fromId: string, toId: string, before: boolean): Promise<void> {
    if (!fromId || !toId || fromId === toId) return;
    const next = moveIdTo(
      items.value.map((c) => c.id),
      fromId,
      toId,
      before
    );
    await setOrder(next);
  }

  /**
   * Create or update a color via `db.colors.add` (upserts by id/colorCode), then
   * reload. Returns the color id, or `null` if the call threw (error surfaced
   * via `lastError`). Core requires `title` + `colorCode` on create (throws
   * otherwise — caught here). `busy`-gated.
   */
  async function add(input: ColorInput): Promise<string | null> {
    busy.value = true;
    try {
      const db = getDatabase();
      const id = await db.colors.add(buildColorInput(input));
      lastError.value = null;
      await refresh();
      return id ?? null;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      logger.error("[colors] add failed:", e);
      return null;
    } finally {
      busy.value = false;
    }
  }

  /** Delete colors by id (soft-delete + unlink relations in core). Never
   *  throws; no-op on empty. */
  async function remove(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    busy.value = true;
    try {
      const db = getDatabase();
      await db.colors.remove(...ids);
      lastError.value = null;
      await refresh();
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      logger.error("[colors] remove failed:", e);
    } finally {
      busy.value = false;
    }
  }

  /**
   * Rename a color's title via `db.colors.add({id, title})` (upsert-by-id —
   * core finds the existing color by `id` and `collection.update`s only the
   * provided fields, so the `colorCode` is preserved), then reload. This is
   * the sidebar color-row's inline-rename path, mirroring the collections
   * store's `renameTag`. Returns `true` on success, `false` on a missing id /
   * empty title / throw.
   */
  async function renameColor(id: string, title: string): Promise<boolean> {
    const trimmed = title.trim();
    if (!id || !trimmed) return false;
    busy.value = true;
    try {
      const db = getDatabase();
      await db.colors.add(buildColorInput({ id, title: trimmed }));
      lastError.value = null;
      await refresh();
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      logger.error("[colors] renameColor failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /**
   * Create a new standalone color (the Colors section header `+`): a color
   * titled `New color` with a swatch cycled from {@link NEW_COLOR_PALETTE},
   * via `db.colors.add` (which requires title + colorCode). Returns the new id,
   * or `null` on failure (error surfaced via `lastError`). The caller enters
   * inline-rename so the user names it directly; the swatch is editable later.
   * A numeric title suffix is appended if `New color` already exists, and the
   * swatch code is the first palette color not already in use (a duplicate
   * colorCode would upsert onto the existing color — distinct codes keep them
   * separate; a hue-nudged fallback covers a full palette).
   */
  async function createColor(): Promise<string | null> {
    const usedCodes = new Set(items.value.map((c) => c.colorCode.toLowerCase()));
    let title = t("sidebar.newColor");
    let n = 2;
    while (items.value.some((c) => c.title === title)) {
      title = t("sidebar.newColorN", { n: n++ });
    }
    let code = NEW_COLOR_PALETTE.find((c) => !usedCodes.has(c.toLowerCase()));
    if (!code) {
      // whole palette in use — derive a distinct code by nudging the first.
      const base = NEW_COLOR_PALETTE[0] ?? "#5b8def";
      let step = 1;
      do {
        code = nudgeHue(base, step++);
      } while (usedCodes.has(code.toLowerCase()));
    }
    return add({ title, colorCode: code });
  }

  /** Count the notes tagged with a color via `db.colors.count(id)` (core reads
   *  `relations.from(color,"note").count()`). Returns `0` on a miss/throw —
   *  never throws. */
  async function noteCount(id: string): Promise<number> {
    try {
      const db = getDatabase();
      const n = await db.colors.count(id);
      return n ?? 0;
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[colors] noteCount failed:", e);
      return 0;
    }
  }

  return {
    items,
    order,
    favoriteIds,
    favorites,
    loading,
    busy,
    lastError,
    count,
    refresh,
    setOrder,
    moveBefore,
    add,
    remove,
    renameColor,
    createColor,
    noteCount,
    isFavoriteColor,
    toggleFavoriteColor
  };
});