import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import { formatPublishUrl } from "@/utils/publish";
import { useNotesStore } from "@/stores/notes";
import type { Note, Monograph } from "@notesnook-vue/contracts";

/**
 * Monographs store — the published-notes list + unpublish action, backed by
 * `@notesnook/core`'s `db.monographs`. Mirrors {@link useArchiveStore} /
 * {@link useTrashStore}: every mutating action reloads the list so the count +
 * items stay consistent.
 *
 * `db.monographs.all` returns a `FilteredSelector<Note>` over notes whose id is
 * in the in-memory published-id cache — so `load()` MUST `await
 * db.monographs.refresh()` first (the cache is empty until refreshed). The
 * `Monograph` row (with `publishUrl`, `datePublished`, `selfDestruct`) comes
 * from `db.monographs.get(id)` per row — the monograph id equals the note id.
 *
 * The public URL is the authoritative server-returned `Monograph.publishUrl`
 * (read via {@link formatPublishUrl}, never hand-constructed) — self-hosters get
 * the correct URL because their API server returns their monograph server's.
 *
 * `totalViews` is server-only via `db.monographs.metadata(id)` (a network
 * round-trip per row; falls back to `{totalViews:0}` on failure). It is loaded
 * lazily after the list renders so the N calls don't block the list — the server
 * enforces the `monographAnalytics` Pro+ feature gate, so no client-side gating.
 */
export interface MonographsListItem {
  id: string;
  title: string;
  headline: string;
  dateEdited: number;
  /** When the note was published (from the `Monograph` row). */
  datePublished: number;
  /** The public monograph URL (server-returned `Monograph.publishUrl`). */
  publishUrl: string;
  /** Whether the monograph self-destructs after its first view. */
  selfDestruct: boolean;
  /** Total views (server-only, lazy-loaded via `db.monographs.metadata`). */
  totalViews?: number;
}

function toMonographsListItem(n: Note, m: Monograph | undefined): MonographsListItem {
  return {
    id: n.id,
    title: n.title || "Untitled",
    headline: n.headline ?? "",
    dateEdited: n.dateEdited,
    datePublished: m?.datePublished ?? 0,
    publishUrl: formatPublishUrl(m),
    selfDestruct: !!m?.selfDestruct
  };
}

export const useMonographsStore = defineStore("monographs", () => {
  const items = ref<MonographsListItem[]>([]);
  const loading = ref(false);

  const count = computed(() => items.value.length);

  /** Lazy-load `totalViews` for each row via `db.monographs.metadata(id)` (a
   *  server round-trip; falls back to 0 on failure). Patched in as each resolves
   *  so the list renders first and views trickle in. No-op when no rows. */
  async function loadAnalytics(): Promise<void> {
    const db = getDatabase();
    await Promise.allSettled(
      items.value.map(async (item) => {
        try {
          const meta = await db.monographs.metadata(item.id);
          if (meta?.analytics?.totalViews !== undefined) {
            patchTotalViews(item.id, meta.analytics.totalViews);
          }
        } catch {
          // leave totalViews undefined — the list still renders.
        }
      })
    );
  }

  /** Patch a single row's `totalViews` (immutable replace so Vue reacts). */
  function patchTotalViews(id: string, totalViews: number): void {
    const i = items.value.findIndex((x) => x.id === id);
    if (i === -1) return;
    items.value = items.value.map((x, idx) => (idx === i ? { ...x, totalViews } : x));
  }

  /** Load all published notes from the database. Refreshes the in-memory
   *  monographs cache first (required — `db.monographs.all` filters by it),
   *  reads the published `Note[]`, enriches each with its `Monograph` row, then
   *  lazy-loads `totalViews`. Never throws — a failure leaves the previous list
   *  intact and logs. */
  async function load(): Promise<void> {
    loading.value = true;
    try {
      const db = getDatabase();
      // MUST precede `all` — the cache is empty until refreshed.
      await db.monographs.refresh();
      const publishedNotes = await db.monographs.all.items();
      const monographRows = await Promise.all(
        publishedNotes.map((n) => db.monographs.get(n.id).catch(() => undefined))
      );
      items.value = publishedNotes.map((n, i) =>
        toMonographsListItem(n, monographRows[i] as Monograph | undefined)
      );
      // Lazy views — don't block the list render or the loading flag.
      void loadAnalytics();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[monographs] load failed:", e);
    } finally {
      loading.value = false;
    }
  }

  /** Unpublish notes by id, then reload this list + the notes list (so the
   *  note's published state refreshes in All Notes). `db.monographs.unpublish`
   *  takes a single id (not variadic), so loop. Never throws. */
  async function unpublish(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const db = getDatabase();
      await Promise.all(ids.map((id) => db.monographs.unpublish(id)));
      await load();
      void useNotesStore().load();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[monographs] unpublish failed:", e);
    }
  }

  return { items, loading, count, load, unpublish, loadAnalytics };
});