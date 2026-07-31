import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import { useNotesStore } from "@/stores/notes";
import { useEditorStore } from "@/stores/editor";
import {
  buildPublishOptions,
  formatPublishUrl,
  type PublishOptions
} from "@/utils/publish";
import { buildSyncOptions } from "@/utils/sync";
import { EV, EVENTS, type Monograph } from "@notesnook-vue/contracts";
import { logger } from "@/utils/logger";

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
 * Event-subscribe is opt-in via `bindMonographsEvents` (called once by
 * `App.vue`), so the store stays unit-testable in isolation — tests never call
 * it, so the global `EV` is untouched (publish/unpublish are request/response,
 * like the sync-control store).
 */
export const usePublishStore = defineStore("publish", () => {
  const notes = useNotesStore();

  /** Idempotency guard for {@link bindMonographsEvents} (mirrors the sync store's
   *  `autoSyncBound` pattern). */
  let monographsBound = false;

  /** True if the active note has a published monograph (from the in-memory
   *  cache populated by `db.monographs.refresh`, then `isPublished`). */
  const published = ref(false);
  /** Public URL of the active note's monograph (`""` while unpublished/unknown). */
  const publishUrl = ref("");
  /** When the active note was published (0 while unpublished/unknown). */
  const datePublished = ref(0);
  /** Whether the active note's monograph self-destructs after its first view
   *  (from the persisted `Monograph` row; `false` while unpublished/unknown).
   *  Used to seed the republish (Update) dialog so the toggle reflects the
   *  current setting. */
  const selfDestruct = ref(false);
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
    selfDestruct.value = false;
  }

  /** Push pending attachment blobs to the server before publishing. Inserted
   *  images are written LOCALLY by `db.attachments.save` with `dateUploaded =
   *  null` (pending); only a send-sync uploads them to S3
   *  (`Sync.send` → `uploadAttachments` → `queueUploads`). The monograph public
   *  page resolves each `<img data-hash>` against the server, so an attachment
   *  that was never uploaded renders as a broken/blank image even though
   *  `db.content.downloadMedia` embeds an inline `data:` URL locally. Running a
   *  `"send"` sync first (uploads pending attachments, sends note content
   *  changes; does NOT pull remote changes) ensures the blobs exist on the
   *  server when the public page asks for them. Never throws — a sync failure
   *  (offline / not authenticated) is logged + swallowed so the publish itself
   *  still proceeds and surfaces its own auth error via `lastError`. No-op when
   *  `db.sync` is unavailable (e.g. minimal test fakes). */
  async function uploadPendingAttachments(): Promise<void> {
    try {
      const db = getDatabase();
      if (typeof db.sync !== "function") return;
      await db.sync(buildSyncOptions({ type: "send" }));
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[publish] attachment upload (send-sync) failed:", e);
    }
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
        selfDestruct.value = m?.selfDestruct ?? false;
      } else {
        publishUrl.value = "";
        datePublished.value = 0;
        selfDestruct.value = false;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[publish] refresh failed:", e);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Publish a note by explicit id to the web via `db.monographs.publish(id,
   * title, opts)`, then reload the notes list + (if it is the active note) the
   * publish state. Returns `true` on success, `false` if the call threw
   * (auth/vault/empty-title gates surface as `lastError`). The title defaults to
   * the active note's title when `title` is undefined AND `id` is the active
   * note; otherwise the caller must supply a title (the context menu / list
   * view pass the right-clicked/row note's title).
   *
   * This is the explicit-id core used by the note context menu + Monographs
   * list (which act on arbitrary notes, not just the active one); the active-
   * note `publish`/`unpublish` below delegate to it.
   */
  async function publishById(
    id: string,
    title: string | undefined,
    opts: { password?: string; selfDestruct?: boolean } = {}
  ): Promise<boolean> {
    publishing.value = true;
    try {
      const db = getDatabase();
      const resolvedTitle =
        (title ?? (id === activeNoteId.value ? notes.activeNote?.title : undefined) ?? "").trim();
      // Before reading `db.content.get` inside `db.monographs.publish`:
      //  (1) when publishing the ACTIVE note, force the focused editor's
      //      pending autosave to disk — otherwise a just-inserted image whose
      //      800ms debounce hasn't fired is absent from the stored content and
      //      `downloadMedia` finds no `data-hash` to embed.
      //  (2) upload pending attachment blobs to the server (see
      //      {@link uploadPendingAttachments}) so the public page can resolve
      //      each image's `data-hash` against S3.
      if (id === activeNoteId.value) {
        await useEditorStore().flushFocusedSave();
      }
      await uploadPendingAttachments();
      await db.monographs.publish(id, resolvedTitle, buildPublishOptions(opts));
      // Copy the now-published note's public URL to the clipboard so the user
      // can share it immediately. Best-effort + never-throws: a clipboard
      // failure (headless test env, missing permissions) is logged + swallowed
      // so it never affects the publish result. The URL is the authoritative
      // server-returned `Monograph.publishUrl` (read via `formatPublishUrl`
      // from the just-persisted row), never hand-constructed. Fetches the row
      // directly (NOT `publishUrl`) so this works for non-active notes too —
      // `refresh()` only reseeds the active note's state.
      try {
        const m = await db.monographs.get(id);
        const url = formatPublishUrl(m);
        if (url && typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(url);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        logger.error("[publish] copy-url after publish failed:", e);
      }
      if (id === activeNoteId.value) await refresh();
      await notes.load();
      lastError.value = null;
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      logger.error("[publish] publish failed:", e);
      return false;
    } finally {
      publishing.value = false;
    }
  }

  /** Unpublish a note by explicit id via `db.monographs.unpublish(id)`, then
   *  reload. Returns `true` on success, `false` if the call threw. */
  async function unpublishById(id: string): Promise<boolean> {
    publishing.value = true;
    try {
      const db = getDatabase();
      await db.monographs.unpublish(id);
      if (id === activeNoteId.value) await refresh();
      await notes.load();
      lastError.value = null;
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      logger.error("[publish] unpublish failed:", e);
      return false;
    } finally {
      publishing.value = false;
    }
  }

  /**
   * Publish the active note to the web. Returns `true` on success, `false` if
   * no note is active or the call threw. The title defaults to the active
   * note's title. Thin wrapper over {@link publishById}.
   */
  async function publish(
    title: string | undefined,
    opts: { password?: string; selfDestruct?: boolean } = {}
  ): Promise<boolean> {
    const id = activeNoteId.value;
    if (!id) return false;
    return publishById(id, title, opts);
  }

  /**
   * Unpublish the active note. Returns `true` on success, `false` if no note is
   * active or the call threw. Thin wrapper over {@link unpublishById}.
   */
  async function unpublish(): Promise<boolean> {
    const id = activeNoteId.value;
    if (!id) return false;
    return unpublishById(id);
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

  /** Subscribe (once) to `EVENTS.monographsUpdated` — the server-pushed signal
   *  that a monograph changed on another device (core emits it from the sync
   *  `SendMonographs` handler with the affected note ids, right after
   *  `db.monographs.refresh()`). Reseed the active note's publish state when it
   *  is among the affected ids (or when the payload is empty — treat as "refresh
   *  all"), and reload the notes list so the published state in All Notes /
   *  Monographs stays consistent. Idempotent — safe to call on every boot.
   *
   *  Opt-in (called once by `App.vue`) so the store stays unit-testable in
   *  isolation: tests construct the store + call `refresh()` directly and never
   *  invoke this, so the global `EV` is untouched. */
  function bindMonographsEvents(): void {
    if (monographsBound) return;
    monographsBound = true;
    EV.subscribe(EVENTS.monographsUpdated, (...args: unknown[]) => {
      const idsArg = args[0];
      const affected = Array.isArray(idsArg) ? (idsArg as string[]) : [];
      const id = activeNoteId.value;
      if (id && (affected.length === 0 || affected.includes(id))) {
        void refresh();
      }
      // Reload the notes list regardless — db.monographs.all filters notes, so
      // a publish/unpublish on another device changes which notes are published.
      void notes.load();
    });
  }

  return {
    published,
    publishUrl,
    datePublished,
    selfDestruct,
    loading,
    publishing,
    lastError,
    activeNoteId,
    refresh,
    publish,
    unpublish,
    publishById,
    unpublishById,
    bindMonographsEvents
  };
});

export type { PublishOptions };