import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import { useNotesStore } from "@/stores/notes";
import {
  buildPublishOptions,
  formatPublishUrl,
  type PublishOptions
} from "@/utils/publish";
import type { Monograph } from "@notesnook-vue/contracts";

/**
 * Publish store (Phase 5.1) — the publish-to-web state for the active note's
 * properties panel: whether the note is published, its public URL, and the
 * publish/unpublish actions over `db.monographs`.
 *
 * Publishing is a server call (`db.monographs.publish` POSTs to the Notesnook
 * API and persists a `Monograph` row locally). It is auth-gated + vault-gated
 * inside core — the store does NOT pre-check those; it lets the call throw and
 * routes the error to `lastError` (never-throws: a failed publish leaves the
 * previous publish state intact and returns `false`). The public URL is read
 * from the persisted `Monograph.publishUrl` (authoritative — the server may use
 * a slug/hash), never hand-constructed.
 *
 * Coupling: reads the active note id + title from the notes store (a facade
 * over the editor-layout store) and the monographs collection from the db.
 * `activeNoteId` is observed via a `watch` so the panel reseeds on note switch.
 * No event-subscribe → isolated testable (publish/unpublish are request/
 * response, like the sync-control store).
 */
export const usePublishStore = defineStore("publish", () => {
  const notes = useNotesStore();

  /** True if the active note has a published monograph (from the in-memory
   *  cache populated by `db.monographs.refresh`, then `isPublished`). */
  const published = ref(false);
  /** Public URL of the active note's monograph (`""` while unpublished/unknown). */
  const publishUrl = ref("");
  /** When the active note was published (0 while unpublished/unknown). */
  const datePublished = ref(0);
  /** True while the publish state is being (re)loaded for a note switch. */
  const loading = ref(false);
  /** True while a publish/unpublish mutation is in flight (gates the UI). */
  const publishing = ref(false);
  /** Last publish/unpublish error message, or `null`. Cleared on success. */
  const lastError = ref<string | null>(null);

  const activeNoteId = computed(() => notes.activeNote?.id ?? null);

  /** Reset the publish state to "unpublished" (used on note switch / no note). */
  function resetState(): void {
    published.value = false;
    publishUrl.value = "";
    datePublished.value = 0;
  }

  /** Reload the publish state for the active note: refresh the in-memory
   *  monographs cache, check `isPublished(id)`, and — if published — read the
   *  persisted `Monograph` row for the URL + date. Idempotent + never throws —
   *  a failure leaves the previous state intact. Resets when no note active. */
  async function refresh(): Promise<void> {
    const id = activeNoteId.value;
    if (!id) {
      resetState();
      return;
    }
    loading.value = true;
    try {
      const db = getDatabase();
      // `isPublished` consults an in-memory cache; `refresh()` repopulates it
      // from the local DB so the answer is accurate after a publish/unpublish
      // in another window/process (core events are per-process).
      await db.monographs.refresh();
      const isPub = db.monographs.isPublished(id);
      published.value = isPub;
      if (isPub) {
        const m: Monograph | undefined = await db.monographs.get(id);
        publishUrl.value = formatPublishUrl(m);
        datePublished.value = m?.datePublished ?? 0;
      } else {
        publishUrl.value = "";
        datePublished.value = 0;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[publish] refresh failed:", e);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Publish the active note to the web via `db.monographs.publish(id, title,
   * opts)`, then reload publish state + the notes list. Returns `true` on
   * success, `false` if no note is active or the call threw (auth/vault/empty-
   * title gates surface as `lastError`). The note title defaults to the active
   * note's title.
   */
  async function publish(
    title: string | undefined,
    opts: { password?: string; selfDestruct?: boolean } = {}
  ): Promise<boolean> {
    const id = activeNoteId.value;
    if (!id) return false;
    publishing.value = true;
    try {
      const db = getDatabase();
      const resolvedTitle = (title ?? notes.activeNote?.title ?? "").trim();
      await db.monographs.publish(id, resolvedTitle, buildPublishOptions(opts));
      await refresh();
      await notes.load();
      lastError.value = null;
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[publish] publish failed:", e);
      return false;
    } finally {
      publishing.value = false;
    }
  }

  /**
   * Unpublish the active note via `db.monographs.unpublish(id)`, then reload.
   * Returns `true` on success, `false` if no note is active or the call threw.
   */
  async function unpublish(): Promise<boolean> {
    const id = activeNoteId.value;
    if (!id) return false;
    publishing.value = true;
    try {
      const db = getDatabase();
      await db.monographs.unpublish(id);
      await refresh();
      await notes.load();
      lastError.value = null;
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[publish] unpublish failed:", e);
      return false;
    } finally {
      publishing.value = false;
    }
  }

  // When the active note changes: reseed the publish state. `immediate` so an
  // already-open note seeds the panel on first mount. `flush: "sync"` so the
  // headless tests can assert synchronously after a note switch.
  watch(
    activeNoteId,
    () => {
      void refresh();
    },
    { immediate: true, flush: "sync" }
  );

  return {
    published,
    publishUrl,
    datePublished,
    loading,
    publishing,
    lastError,
    activeNoteId,
    refresh,
    publish,
    unpublish
  };
});

export type { PublishOptions };