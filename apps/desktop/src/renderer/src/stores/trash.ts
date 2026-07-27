import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import { logger } from "@/utils/logger";

/**
 * Trash store (Phase 3.2 — real-views headless slice) — the trashed-items list
 * + restore/delete-permanently/clear actions, backed by `@notesnook/core`'s
 * `db.trash`. Backs the future TrashView (on-site); the sidebar already shows
 * the trash *count* via the collections store.
 *
 * `db.trash.all()` returns a `TrashItem` union (`BaseTrashItem<Note>` |
 * `BaseTrashItem<Notebook>`); here each is mapped to a {@link TrashListItem}
 * with a `type` discriminator so the view can show notes (and notebooks). The
 * `noteItems` computed filters to note trash for the primary trash list.
 *
 * Every mutating action reloads the list so the count + items stay consistent
 * (the collections store's `trashCount` is reloaded separately by the shell).
 */

export interface TrashListItem {
  id: string;
  type: "note" | "notebook";
  title: string;
  headline: string;
  dateDeleted: number;
  dateEdited: number;
}

function toTrashListItem(t: {
  id: string;
  itemType: "note" | "notebook";
  title?: string;
  headline?: string;
  dateDeleted: number;
  dateEdited?: number;
}): TrashListItem {
  return {
    id: t.id,
    type: t.itemType,
    title: t.title || "Untitled",
    headline: t.headline ?? "",
    dateDeleted: t.dateDeleted,
    dateEdited: t.dateEdited ?? t.dateDeleted
  };
}

export const useTrashStore = defineStore("trash", () => {
  const items = ref<TrashListItem[]>([]);
  const loading = ref(false);

  const count = computed(() => items.value.length);
  /** Note-only trash items (the primary trash list). */
  const noteItems = computed(() => items.value.filter((t) => t.type === "note"));

  /** Load all trashed items from the database. Never throws — a failure leaves
   * the previous list intact and logs. */
  async function load(): Promise<void> {
    loading.value = true;
    try {
      const db = getDatabase();
      const all = await db.trash.all();
      items.value = all.map(toTrashListItem);
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[trash] load failed:", e);
    } finally {
      loading.value = false;
    }
  }

  /** Restore trashed items by id (back to their collections). */
  async function restore(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const db = getDatabase();
      await db.trash.restore(...ids);
      await load();
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[trash] restore failed:", e);
    }
  }

  /** Permanently delete trashed items by id. */
  async function remove(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const db = getDatabase();
      await db.trash.delete(...ids);
      await load();
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[trash] remove failed:", e);
    }
  }

  /** Empty the trash entirely. */
  async function clear(): Promise<void> {
    try {
      const db = getDatabase();
      await db.trash.clear();
      await load();
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[trash] clear failed:", e);
    }
  }

  return { items, loading, count, noteItems, load, restore, remove, clear };
});