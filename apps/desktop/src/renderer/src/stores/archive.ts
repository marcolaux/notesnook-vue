import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import type { Note } from "@notesnook-vue/contracts";
import { logger } from "@/utils/logger";

/**
 * Archive store — the archived-notes list + unarchive / move-to-trash actions,
 * backed by `@notesnook/core`'s `db.notes.archived` selector (a
 * `FilteredSelector<Note>` over notes whose `archived` flag is true). Mirrors
 * the {@link useTrashStore} shape: every mutating action reloads the list so
 * the count + items stay consistent. The sidebar archive *count* badge lives in
 * the collections store (loaded at boot + refreshed by callers via
 * `collections.reloadArchiveCount()`).
 *
 * Archived notes are excluded from `db.notes.all` (the All Notes list) by the
 * core filter, so they only surface here. They remain openable/editable —
 * `db.notes.note(id)` is a direct lookup, not archive-filtered — so clicking a
 * row opens the note in the editor (matches upstream). Permanent removal still
 * goes through trash: `moveToTrash` here calls `db.notes.moveToTrash(...ids)`,
 * keeping the note restorable from the Trash view.
 *
 * `Note` carries `title`, optional `headline`, `dateEdited` (+ `dateCreated`
 * from `BaseItem`); each is mapped to an {@link ArchiveListItem} with an
 * "Untitled" fallback so the view never renders an empty title.
 */
export interface ArchiveListItem {
  id: string;
  title: string;
  headline: string;
  dateEdited: number;
  dateCreated: number;
}

function toArchiveListItem(n: Note): ArchiveListItem {
  return {
    id: n.id,
    title: n.title || "Untitled",
    headline: n.headline ?? "",
    dateEdited: n.dateEdited,
    dateCreated: n.dateCreated
  };
}

export const useArchiveStore = defineStore("archive", () => {
  const items = ref<ArchiveListItem[]>([]);
  const loading = ref(false);

  const count = computed(() => items.value.length);

  /** Load all archived notes from the database. Never throws — a failure leaves
   *  the previous list intact and logs. */
  async function load(): Promise<void> {
    loading.value = true;
    try {
      const db = getDatabase();
      const all = await db.notes.archived.items();
      items.value = all.map(toArchiveListItem);
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[archive] load failed:", e);
    } finally {
      loading.value = false;
    }
  }

  /** Unarchive notes by id (back to All Notes). */
  async function unarchive(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const db = getDatabase();
      await db.notes.archive(false, ...ids);
      await load();
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[archive] unarchive failed:", e);
    }
  }

  /** Move archived notes to trash by id (keeps them restorable from Trash). */
  async function moveToTrash(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const db = getDatabase();
      await db.notes.moveToTrash(...ids);
      await load();
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[archive] moveToTrash failed:", e);
    }
  }

  return { items, loading, count, load, unarchive, moveToTrash };
});