/**
 * Per-note semantic neighbourhood helper (headless, framework-light).
 *
 * Returns the active note plus its K nearest semantic neighbours — NOT the whole
 * account (that's `VectorVisualizerModal` + `buildVisualizerGraph`). The local
 * visualizer in the right sidebar (`NoteVisualizer.vue`) consumes this to draw a
 * center-and-spokes graph of the note's immediate neighbourhood.
 *
 * Reuses the account visualizer's primitives so no new math is introduced:
 *   • `getAllNoteCentroidEmbeddings` — one call yields BOTH the centre vector and
 *     every neighbour's centroid (neighbours come from `vec_notes`, so their
 *     centroids exist in this map).
 *   • `searchVectorEmbeddingsByVector` — the vec0 KNN that picks candidate note
 *     ids. The KNN distance is only used to *find* candidates; the displayed
 *     similarity is the real centroid↔centroid cosine sim (consistent with the
 *     account visualizer's edge weights).
 *   • `computeEmbedding` — title-embed fallback when the centre note has no
 *     stored centroid yet (mirrors `buildVisualizerGraph`'s fallback).
 *
 * Gated by `readSemanticSearchEnabled`: returns an empty neighbourhood when
 * semantic search is off (no vectors indexed). Self-excluded and live-filtered
 * (non-trashed/archived) like `findSimilarNotes`.
 */

import { getCurrentContext } from "@/platform/bootstrap";
import { readSemanticSearchEnabled } from "@/stores/settings";
import {
  computeEmbedding,
  getAllNoteCentroidEmbeddings,
  searchVectorEmbeddingsByVector
} from "@/utils/vector-search";
import { cosineSimilarity } from "@/utils/vector-clustering";
import { logger } from "./logger";

export interface NeighbourNode {
  noteId: string;
  title: string;
  vector: Float32Array;
  /** Cosine similarity to the centre centroid, ∈ [-1, 1] (clamped). */
  similarity: number;
}

export interface NoteNeighbourhood {
  /** The active note + its centroid vector. `null` only when semantic search is
   *  disabled or the note has neither a stored centroid nor a resolvable title
   *  to embed — i.e. there is genuinely nothing to centre on. */
  center: { noteId: string; title: string; vector: Float32Array } | null;
  /** K nearest neighbours, sorted by similarity desc. Each carries its centroid
   *  vector (for PCA projection + edge drawing) and the cosine similarity to the
   *  centre. Empty when semantic search is off or no other live notes match. */
  neighbours: NeighbourNode[];
}

export interface NeighbourhoodOptions {
  /** Max neighbours to return. */
  limit: number;
  /** Live (non-trashed/archived) note ids; when provided, other ids are dropped. */
  liveNoteIds?: ReadonlySet<string>;
  /** Resolves a note id to its title (caller passes `notesStore.titleOf`). */
  titleFor?: (id: string) => string | undefined;
}

/**
 * Resolve the semantic neighbourhood of `noteId`: the note's own centroid plus
 * its K nearest neighbours (with centroid vectors + cosine similarity).
 *
 * The KNN over-fetches (`limit * 4`) because vec0 returns chunk-level rows and a
 * single note can occupy several of the top slots; we dedupe by note id (keeping
 * the best/nearest chunk) before slicing to `limit`.
 */
export async function getNoteNeighbourhood(
  noteId: string,
  opts: NeighbourhoodOptions
): Promise<NoteNeighbourhood> {
  const empty: NoteNeighbourhood = { center: null, neighbours: [] };
  if (!noteId) return empty;
  if (!readSemanticSearchEnabled(getCurrentContext())) return empty;

  const limit = Math.max(1, opts.limit);
  const titleFor = opts.titleFor ?? (() => undefined);

  try {
    // One call supplies the centre centroid and every neighbour's centroid.
    const centroids = await getAllNoteCentroidEmbeddings();

    // --- Centre vector ------------------------------------------------------
    let centerVec: Float32Array | null = centroids.get(noteId)?.embedding ?? null;
    let centerTitle = titleFor(noteId) ?? "Untitled";
    if (!centerVec) {
      // Note not yet indexed (no chunks in vec_notes). Embed the title so we can
      // still KNN-search for related notes on its behalf — same fallback the
      // account visualizer uses for un-indexed notes.
      const fallback = await computeEmbedding(centerTitle);
      if (!fallback) return { center: null, neighbours: [] };
      centerVec = fallback;
    }

    // --- KNN candidates -----------------------------------------------------
    // Over-fetch; vec0 returns chunks (multiple per note). Dedupe by note id,
    // keeping the nearest chunk per note.
    const knn = await searchVectorEmbeddingsByVector(centerVec, limit * 4);
    const bestByNote = new Map<string, number>(); // noteId → best (smallest) distance
    for (const r of knn) {
      if (r.noteId === noteId) continue; // exclude self
      const prev = bestByNote.get(r.noteId);
      if (prev === undefined || r.distance < prev) bestByNote.set(r.noteId, r.distance);
    }

    // --- Filter + rank by real centroid↔centroid cosine similarity -----------
    const neighbours: NeighbourNode[] = [];
    for (const [nid] of bestByNote) {
      if (opts.liveNoteIds && !opts.liveNoteIds.has(nid)) continue;
      const centroid = centroids.get(nid)?.embedding;
      if (!centroid) continue; // shouldn't happen (KNN comes from vec_notes), but guard
      const sim = cosineSimilarity(centerVec, centroid);
      neighbours.push({ noteId: nid, title: titleFor(nid) ?? "Untitled", vector: centroid, similarity: sim });
    }

    neighbours.sort((a, b) => b.similarity - a.similarity);

    return {
      center: { noteId, title: centerTitle, vector: centerVec },
      neighbours: neighbours.slice(0, limit)
    };
  } catch (err) {
    logger.error("[note-neighbourhood] failed:", err);
    return empty;
  }
}