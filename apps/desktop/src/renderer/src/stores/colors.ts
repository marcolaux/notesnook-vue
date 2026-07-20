import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import type { Color } from "@notesnook-vue/contracts";
import {
  buildColorInput,
  sortColorsByTitle,
  type ColorInput
} from "@/utils/colors";

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

export const useColorsStore = defineStore("colors", () => {
  /** All colors, title-ascending. */
  const items = ref<Color[]>([]);
  /** True while the list is being (re)loaded. */
  const loading = ref(false);
  /** True while a create/delete mutation is in flight. */
  const busy = ref(false);
  /** Last mutation error message, or `null`. Cleared on success. */
  const lastError = ref<string | null>(null);

  const count = computed(() => items.value.length);

  /** Reload the color list from the database, title-ascending. Never throws —
   *  a failure leaves the previous list intact and logs. */
  async function refresh(): Promise<void> {
    loading.value = true;
    try {
      const db = getDatabase();
      const all: Color[] = await db.colors.all.items();
      items.value = sortColorsByTitle(all);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[colors] refresh failed:", e);
    } finally {
      loading.value = false;
    }
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
      console.error("[colors] add failed:", e);
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
      console.error("[colors] remove failed:", e);
    } finally {
      busy.value = false;
    }
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
      console.error("[colors] noteCount failed:", e);
      return 0;
    }
  }

  return {
    items,
    loading,
    busy,
    lastError,
    count,
    refresh,
    add,
    remove,
    noteCount
  };
});