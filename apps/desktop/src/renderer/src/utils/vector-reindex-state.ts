/**
 * Pure reindex state-machine decision, extracted from `vector-search.ts` so the
 * branch logic (stored / pending / fresh / resume) is unit-testable without
 * pulling in the heavy platform deps (desktop bridge, worker, db, bootstrap)
 * that `migrateEmbeddingModelIfNeeded` transitively loads.
 *
 * Two per-context localStorage keys drive it:
 *   • `embeddingModel`            — the model that produced the vectors in
 *     `vec_notes` once a reindex of it FULLY drained.
 *   • `embeddingModelReindexPending` — the model being reindexed; present means
 *     the previous reindex was interrupted (app closed mid-drain), so the
 *     vectors present are already that model but incomplete.
 *
 * Kept dependency-free (no Vue, no platform) on purpose.
 */

export type ReindexAction = "done" | "resume" | "fresh";

/**
 * Decide what `migrateEmbeddingModelIfNeeded` should do for the configured
 * `modelId`, given the stored completed-model and the pending (in-progress)
 * marker.
 *
 *  • `done`   — `stored === modelId`: the index is already on this model;
 *    ordinary catch-up of any unindexed notes is enough.
 *  • `resume` — `pending === modelId`: a reindex of this model was interrupted.
 *    The vectors present are already this model (just incomplete), so resume
 *    with a catch-up — NOT a purge (don't throw away partial work).
 *  • `fresh`  — neither: a genuine model change. Purge the old model's vectors,
 *    re-queue everything, and set the pending marker.
 *
 * A stale `pending` for a *different* model (e.g. an abandoned older swap) does
 * NOT count as `resume` — it falls through to `fresh`, which purges and starts
 * clean. `stored` takes precedence over `pending` (a completed reindex is
 * final even if a stray pending marker lingers).
 */
export function decideReindexAction(
  stored: string | null,
  pending: string | null,
  modelId: string
): ReindexAction {
  if (stored === modelId) return "done";
  if (pending === modelId) return "resume";
  return "fresh";
}