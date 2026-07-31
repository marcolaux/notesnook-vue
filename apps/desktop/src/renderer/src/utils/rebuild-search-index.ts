/**
 * Rebuild the lexical (FTS5) search index — shared action used by both the
 * `app:rebuild-search-index` palette command and the Search settings section.
 *
 * `db.lookup.rebuild()` → core's `rebuildSearchIndex` (see
 * `vendor/notesnook/.../database/fts.ts`): drops every row from `notes_fts`
 * (titles) + `content_fts` (bodies) and reinserts them from the current
 * `notes`/`content` tables in one transaction. Idempotent + safe.
 *
 * Why this exists: a note whose title was never backfilled into `notes_fts`
 * (e.g. created before the `a-2025-06-04` migration's backfill ran for an
 * existing DB) is invisible to lexical title search — body search still works
 * because `content_fts` was populated. Running this once repopulates
 * `notes_fts` so titles of older notes are findable again. New notes are
 * unaffected (triggers index them live); this only repairs pre-existing ones.
 *
 * This is the LEXICAL index only — it does NOT touch the vector/semantic
 * index (`vec_notes`); that has its own purge action (`purgeVectorIndex`).
 */
import { useDialogStore } from "@/stores/dialog";
import { getDatabase } from "@/platform/bootstrap";
import { logger } from "@/utils/logger";
import i18n from "@/i18n";

const t = i18n.global.t.bind(i18n.global);

/**
 * Confirm, rebuild the lexical FTS5 index, then surface the result. No-ops if
 * the user dismisses the confirm. Safe to call from any window that has
 * bootstrapped the DB (main + settings windows both do).
 */
export async function rebuildSearchIndexWithConfirm(): Promise<void> {
  const dialog = useDialogStore();
  const ok = await dialog.confirm({
    title: t("searchIndex.confirmTitle"),
    message: t("searchIndex.confirmMessage"),
    confirmLabel: t("searchIndex.confirmLabel")
  });
  if (!ok) return;
  try {
    await getDatabase().lookup.rebuild();
    // `confirm()` is the only dialog shape we have (no alert); reuse it as an
    // info popup — Cancel just closes.
    await dialog.confirm({
      title: t("searchIndex.doneTitle"),
      message: t("searchIndex.doneMessage")
    });
  } catch (e) {
    logger.error("[search] rebuild lexical index failed:", e);
    void dialog.confirm({
      title: t("searchIndex.doneTitle"),
      message: t("searchIndex.failedMessage")
    });
  }
}