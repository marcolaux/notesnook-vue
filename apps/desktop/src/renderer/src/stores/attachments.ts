/*
Attachments store — the headless data backend for the Attachments settings
section. Owns all `db.attachments` / `db.relations` orchestration; the section
is thin UI over it (and owns the `window.confirm` gates, matching
`VaultSection` — so this store is unit-testable in node without a `window`).

Orphan detection and "which notes use this attachment" are built into core:
  - `db.attachments.orphaned` — selector for attachments whose `id` is not in
    the `relations` table as `toType:"attachment"` (the `relations` table is
    kept in sync by `content.postProcess` on every note save, so this is the
    indexed source of truth — no content scanning here).
  - `db.relations.to({id,type:"attachment"}, "note").resolve()` — the linked
    `Note[]` for an attachment (excludes trashed/archived).
  - `db.attachments.removeOrphaned()` — bulk cleanup.

`db.attachments.*` works in local mode too: `ensureLocalUser` (bootstrap)
synthesizes the master key + pre-seeds `attachmentsKey`, so no auth-gating is
needed here. Actions are never-throw (catch + set `error` + log, mirroring
`stores/settings.ts`); after a mutation we call
`desktop.window.notifyDataChanged` so the main window reloads notes whose HTML
was changed by `remove`'s detach step (the settings window is a separate
renderer; core events are per-process).
*/
import { defineStore } from "pinia";
import { ref } from "vue";
import type { Attachment, Note } from "@notesnook-vue/contracts";
import { getDatabase } from "@/platform/bootstrap";
import { desktop } from "@/platform/desktop-bridge";
import {
  ATTACHMENT_FILTERS,
  type AttachmentFilter
} from "@/utils/attachments";
import { logger } from "@/utils/logger";

export const useAttachmentsStore = defineStore("attachments", () => {
  const items = ref<Attachment[]>([]);
  const filter = ref<AttachmentFilter>("all");
  const counts = ref<Record<AttachmentFilter, number>>({
    all: 0,
    images: 0,
    videos: 0,
    audios: 0,
    documents: 0,
    orphaned: 0
  });
  /** Total bytes of the CURRENT filter (for the header summary). */
  const totalBytes = ref(0);
  /** Total bytes of orphaned attachments (always, regardless of filter). */
  const orphanedBytes = ref(0);
  const loading = ref(false);
  const error = ref<string | undefined>(undefined);
  /** hash → linked notes, loaded lazily per row expand. */
  const usage = ref<Record<string, Note[]>>({});
  const usageLoading = ref<Record<string, boolean>>({});
  /** ids of orphaned attachments (so a row in any tab can show the badge
   *  without an extra query per row). Refreshed on `load()`. */
  const orphanedIds = ref<Set<string>>(new Set());

  function selectorFor(f: AttachmentFilter) {
    const def = ATTACHMENT_FILTERS.find((x) => x.id === f);
    if (!def) throw new Error(`Unknown attachment filter: ${f}`);
    return def.selector(getDatabase());
  }

  /**
   * Re-fetch the list + all filter counts + sizes for the active filter. The
   * 6 counts + 2 sizes are fine on a settings page (not a hot path). Never
   * throws — a failure sets `error` and leaves the previous list intact.
   */
  async function load(): Promise<void> {
    loading.value = true;
    error.value = undefined;
    try {
      const db = getDatabase();
      const sel = selectorFor(filter.value);
      const [
        list,
        allCount,
        imagesCount,
        videosCount,
        audiosCount,
        documentsCount,
        orphanedCount,
        total,
        orphSize,
        orphIds
      ] = await Promise.all([
        sel.items(),
        db.attachments.all.count(),
        db.attachments.images.count(),
        db.attachments.videos.count(),
        db.attachments.audios.count(),
        db.attachments.documents.count(),
        db.attachments.orphaned.count(),
        db.attachments.totalSize(sel),
        db.attachments.totalSize(db.attachments.orphaned),
        db.attachments.orphaned.ids()
      ]);
      items.value = list;
      counts.value = {
        all: allCount,
        images: imagesCount,
        videos: videosCount,
        audios: audiosCount,
        documents: documentsCount,
        orphaned: orphanedCount
      };
      totalBytes.value = total ?? 0;
      orphanedBytes.value = orphSize ?? 0;
      orphanedIds.value = new Set(orphIds);
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[attachments] load failed:", e);
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  /** Switch filter tab and reload. */
  async function setFilter(f: AttachmentFilter): Promise<void> {
    filter.value = f;
    await load();
  }

  /** Best-effort cross-window signal: the main window reloads its stores so
   *  notes whose HTML was mutated by a delete's detach step stay in sync. */
  function signalDataChanged(): void {
    void desktop.window.notifyDataChanged.mutate().catch(() => {
      /* main unreachable (e.g. tests) — the delete still succeeded locally */
    });
  }

  /**
   * Delete one attachment. `localOnly:false` matches upstream's
   * `removeOrphaned` (syncs the deletion in logged-in mode; no-op in local
   * mode). `remove` also strips the hash from each linked note's HTML and
   * unlinks relations. Returns `true` on success. Never throws — a failure
   * (e.g. attachment inside a locked/vault note) sets `error` and returns
   * `false` so the row stays. The caller (section) owns the `window.confirm`.
   */
  async function remove(attachment: Attachment): Promise<boolean> {
    try {
      await getDatabase().attachments.remove(attachment.hash, false);
      signalDataChanged();
      await load();
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[attachments] remove failed:", e);
      error.value = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  /** Delete all orphaned attachments. Implemented as a loop over the
   *  `orphaned` selector + `remove` because the currently-vendored core build
   *  predates `Attachments.removeOrphaned`/`bulkRemove` (they exist in the
   *  upstream source but not the built `vendor-dist` `.d.ts`/JS). This is
   *  semantically identical to upstream's `bulkRemove(orphaned, false)`; a
   *  future vendor rebuild can swap back to `db.attachments.removeOrphaned()`. */
  async function removeOrphaned(): Promise<boolean> {
    try {
      const db = getDatabase();
      const orphans = await db.attachments.orphaned.items();
      for (const a of orphans) {
        await db.attachments.remove(a.hash, false);
      }
      signalDataChanged();
      await load();
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[attachments] removeOrphaned failed:", e);
      error.value = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  /**
   * Resolve the notes that reference an attachment (lazy, per row expand).
   * `attachment(hash)` resolves the `id` (relations are keyed by attachment
   * `id`, not `hash`); `relations.to(...,"note").resolve()` returns the
   * linked `Note[]` (excludes trashed/archived). Cached in `usage[hash]`.
   * Never throws — resolves to `[]` on failure.
   */
  async function loadUsage(attachment: Attachment): Promise<Note[]> {
    usageLoading.value = { ...usageLoading.value, [attachment.hash]: true };
    try {
      const db = getDatabase();
      const att = await db.attachments.attachment(attachment.hash);
      const notes = att
        ? await db.relations.to({ id: att.id, type: "attachment" }, "note").resolve()
        : [];
      usage.value = { ...usage.value, [attachment.hash]: notes };
      return notes;
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[attachments] loadUsage failed:", e);
      usage.value = { ...usage.value, [attachment.hash]: [] };
      return [];
    } finally {
      usageLoading.value = { ...usageLoading.value, [attachment.hash]: false };
    }
  }

  /** Open a linked note in its own focused window. `desktop.window.openNote`
   *  is already wired end-to-end: the note window boots with
   *  `?window=note&noteId=` and `App.vue` enables focus mode + selects the
   *  note. One window per note (focused if alive). */
  async function openNote(noteId: string): Promise<void> {
    try {
      await desktop.window.openNote.mutate({ noteId });
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[attachments] openNote failed:", e);
    }
  }

  return {
    items,
    filter,
    counts,
    totalBytes,
    orphanedBytes,
    loading,
    error,
    usage,
    usageLoading,
    orphanedIds,
    load,
    setFilter,
    remove,
    removeOrphaned,
    loadUsage,
    openNote
  };
});