/**
 * Pure state-machine coverage for the model-change reindex decision
 * (`decideReindexAction`), extracted from `vector-search.ts` so it can be tested
 * without the heavy platform deps (desktop bridge, worker, db, bootstrap). The
 * migration (`migrateEmbeddingModelIfNeeded`) calls this to pick its branch, so
 * these tests cover the real decision logic, not a copy.
 *
 * Keys recap (see `vector-reindex-state.ts`):
 *   • `stored`  — the model that produced the vectors once a reindex DRAINED.
 *   • `pending` — the model being reindexed; present ⇒ an interrupted reindex.
 */
import { describe, it, expect } from "vitest";
import { decideReindexAction } from "@/utils/vector-reindex-state";

const MODEL = "granite-multilingual";

describe("decideReindexAction", () => {
  it("returns 'done' when the stored model is the configured model", () => {
    expect(decideReindexAction(MODEL, null, MODEL)).toBe("done");
    // A stray pending marker does not un-done a completed reindex.
    expect(decideReindexAction(MODEL, MODEL, MODEL)).toBe("done");
    expect(decideReindexAction(MODEL, "other", MODEL)).toBe("done");
  });

  it("returns 'resume' when only the pending marker matches (interrupted reindex)", () => {
    expect(decideReindexAction(null, MODEL, MODEL)).toBe("resume");
    expect(decideReindexAction("old-model", MODEL, MODEL)).toBe("resume");
  });

  it("returns 'fresh' when neither key matches the configured model", () => {
    expect(decideReindexAction(null, null, MODEL)).toBe("fresh");
    expect(decideReindexAction("old-model", null, MODEL)).toBe("fresh");
    expect(decideReindexAction("old-model", "old-model", MODEL)).toBe("fresh");
  });

  it("treats a stale pending marker for a DIFFERENT model as fresh (not resume)", () => {
    // An abandoned older swap's pending marker must not be mistaken for a
    // resumable reindex of the CURRENT model — that would skip the purge and
    // mix old+new vectors. It must fall through to a clean fresh reindex.
    expect(decideReindexAction("old-model", "abandoned-older", MODEL)).toBe("fresh");
    expect(decideReindexAction(null, "abandoned-older", MODEL)).toBe("fresh");
  });

  it("stored takes precedence over pending (a completed reindex is final)", () => {
    // Even if a pending marker lingers, stored===model means done.
    expect(decideReindexAction(MODEL, "abandoned-older", MODEL)).toBe("done");
  });
});