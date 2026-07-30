/**
 * Cluster-based search tier — the third (lowest-priority) result category in the
 * omnibar's tiered search, alongside Exact (FTS5) and Semantic (vector KNN).
 *
 * Reuses the clustering primitives that already power the Vector Visualizer
 * (`runKMeans`, `cosineSimilarity`, `normalizeVector` in `vector-clustering.ts`)
 * and the per-note centroid scan (`getAllNoteCentroidEmbeddings` in
 * `vector-search.ts`), but adds an in-memory cache so the O(n·k·384) k-means +
 * full-vector SQL scan does NOT run on every keystroke.
 *
 * Lifecycle (lazy + cached + async, per the approved plan):
 *   - `ensureClusterCache()` builds once on first use (or after invalidation),
 *     coalescing concurrent builds. Exact + Semantic tiers render instantly;
 *     the Cluster tier fades in once this resolves.
 *   - `invalidateClusterCache()` is called by `vector-search.ts` on every index
 *     mutation (`indexNoteEmbeddings` / `deleteNoteEmbeddings` /
 *     `purgeVectorIndex`) so an edit / add / delete forces a rebuild on the next
 *     search. A build invalidated mid-flight is discarded (generation guard) so
 *     a stale clustering is never committed over a fresher one.
 *
 * The tier is *blended*: it unions (a) the cluster whose centroid is nearest to
 * the query embedding with (b) the clusters that the top Exact/Semantic hits
 * belong to, then excludes any note already surfaced by the higher tiers and
 * ranks the remainder by cosine similarity to the query.
 */
import { getAllNoteCentroidEmbeddings } from "./vector-search";
import { runKMeans, cosineSimilarity, normalizeVector } from "./vector-clustering";
import { logger } from "./logger";

interface ClusterCache {
  /** Per-cluster centroid (unit-normalized), indexed by cluster id. */
  centroids: Float32Array[];
  /** Member note ids per cluster. */
  clusterNoteIds: string[][];
  /** noteId → clusterId (inverse of `clusterNoteIds`). */
  noteCluster: Map<string, number>;
  /** noteId → its centroid vector (for within-cluster ranking). */
  noteCentroids: Map<string, Float32Array>;
}

let cache: ClusterCache | null = null;
let building: Promise<ClusterCache | null> | null = null;
/** Bumped on every invalidation so a build invalidated mid-flight won't commit. */
let buildGen = 0;

/** Drop the cached clustering. Called from `vector-search.ts` on index changes. */
export function invalidateClusterCache(): void {
  cache = null;
  buildGen++;
}

/** Build (or return the cached) clustering of all note centroids. Concurrent
 *  callers share one in-flight build. Resolves to `null` if there are no
 *  indexed notes or the build failed / was invalidated. */
export async function ensureClusterCache(): Promise<ClusterCache | null> {
  if (cache) return cache;
  if (building) return building; // coalesce concurrent builds
  building = buildClusterCache();
  try {
    return await building;
  } finally {
    building = null;
  }
}

async function buildClusterCache(): Promise<ClusterCache | null> {
  const myGen = buildGen;
  try {
    const noteCentroidsMap = await getAllNoteCentroidEmbeddings();
    if (noteCentroidsMap.size === 0) {
      cache = null;
      return null;
    }

    const noteIds = Array.from(noteCentroidsMap.keys());
    const vectors = noteIds.map((id) => noteCentroidsMap.get(id)!.embedding);
    const n = vectors.length;
    const dim = vectors[0]?.length ?? 384;

    // k scales with corpus size, clamped: small sets → 3, very large → 12.
    const k = Math.min(12, Math.max(3, Math.round(Math.sqrt(n))));
    const assignments = runKMeans(vectors, k);

    const clusterNoteIds: string[][] = Array.from({ length: k }, () => []);
    const noteCluster = new Map<string, number>();
    const centroidAcc = Array.from({ length: k }, () => new Float32Array(dim));
    const counts = new Array<number>(k).fill(0);

    for (let i = 0; i < n; i++) {
      const c = assignments[i] ?? 0;
      const id = noteIds[i]!;
      clusterNoteIds[c]?.push(id);
      noteCluster.set(id, c);
      const acc = centroidAcc[c]!;
      const v = vectors[i]!;
      for (let d = 0; d < dim; d++) acc[d] = (acc[d] ?? 0) + (v[d] ?? 0);
      counts[c] = (counts[c] ?? 0) + 1;
    }

    const centroids: Float32Array[] = [];
    for (let c = 0; c < k; c++) {
      const acc = centroidAcc[c]!;
      const count = counts[c] ?? 0;
      if (count > 0) {
        for (let d = 0; d < dim; d++) acc[d] = (acc[d] ?? 0) / count;
        normalizeVector(acc);
      }
      centroids.push(acc);
    }

    const noteCentroids = new Map<string, Float32Array>();
    for (let i = 0; i < n; i++) noteCentroids.set(noteIds[i]!, vectors[i]!);

    // If invalidated while we were building, don't commit a stale clustering.
    if (myGen !== buildGen) return null;

    const built: ClusterCache = { centroids, clusterNoteIds, noteCluster, noteCentroids };
    cache = built;
    return built;
  } catch (err) {
    logger.error("[vector-search-clusters] buildClusterCache failed:", err);
    cache = null;
    return null;
  }
}

/**
 * The blended cluster tier: note ids related to the query via clustering,
 * excluding any already surfaced by the Exact/Semantic tiers.
 *
 * @param queryVec     the query embedding (already computed for the semantic tier)
 * @param topHitNoteIds  top Exact/Semantic hit ids — used for "same cluster" expansion
 * @param excludeIds   all Exact/Semantic note ids (dedup downward)
 * @param limit        max ids to return
 * @returns ranked note ids (best first), possibly empty
 */
export async function getClusterTierNoteIds(
  queryVec: Float32Array,
  topHitNoteIds: string[],
  excludeIds: Set<string>,
  limit: number
): Promise<string[]> {
  if (!queryVec || queryVec.length === 0 || limit <= 0) return [];
  const c = await ensureClusterCache();
  if (!c) return [];

  // (a) Nearest cluster to the query.
  let bestCluster = -1;
  let bestSim = -Infinity;
  for (let i = 0; i < c.centroids.length; i++) {
    const sim = cosineSimilarity(queryVec, c.centroids[i]!);
    if (sim > bestSim) {
      bestSim = sim;
      bestCluster = i;
    }
  }

  const candidateIds = new Set<string>();
  if (bestCluster >= 0) {
    for (const id of c.clusterNoteIds[bestCluster] ?? []) candidateIds.add(id);
  }

  // (b) Same cluster as the top hits.
  for (const id of topHitNoteIds) {
    const cl = c.noteCluster.get(id);
    if (cl === undefined) continue;
    for (const id2 of c.clusterNoteIds[cl] ?? []) candidateIds.add(id2);
  }

  // Dedup downward: drop anything already returned by the higher tiers.
  for (const id of excludeIds) candidateIds.delete(id);

  // Rank the remainder by cosine similarity to the query, descending.
  const ranked: { id: string; sim: number }[] = [];
  for (const id of candidateIds) {
    const nc = c.noteCentroids.get(id);
    if (!nc) continue;
    ranked.push({ id, sim: cosineSimilarity(queryVec, nc) });
  }
  ranked.sort((a, b) => b.sim - a.sim);

  return ranked.slice(0, limit).map((r) => r.id);
}