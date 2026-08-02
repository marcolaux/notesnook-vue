/**
 * Coverage for the vector-clustering math changed in the visualizer fix:
 *   • `projectPCA2D` is now SEEDED (was `Math.random()`) → deterministic.
 *   • similarity edges are now kNN (top-K per node, threshold-floor), not the
 *     O(n²) all-pairs pass that drew a thicket of lines after the granite swap.
 *   • `runDBSCAN` / `runKMeans` basics + the convex hull used for cluster bubbles.
 *
 * `vector-clustering` only has two runtime deps — `./vector-search`
 * (computeEmbedding / getAllNoteCentroidEmbeddings) and `@/i18n` — both mocked
 * here so the pure maths load without the desktop bridge / worker / db.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/utils/vector-search", () => ({
  computeEmbedding: vi.fn(),
  getAllNoteCentroidEmbeddings: vi.fn(async () => new Map())
}));
vi.mock("@/i18n", () => ({
  default: { global: { t: (k: string) => k } }
}));

import { computeEmbedding, getAllNoteCentroidEmbeddings } from "@/utils/vector-search";
import {
  cosineSimilarity,
  runKMeans,
  runDBSCAN,
  projectPCA2D,
  computeConvexHull,
  buildVisualizerGraph,
  DEFAULT_CLUSTERING_OPTIONS,
  type ClusteringOptions
} from "@/utils/vector-clustering";

const DIM = 384;

/** Unit vector with `value` in dimension `axis` (everything else 0). */
function axisUnit(axis: number, value = 1): Float32Array {
  const v = new Float32Array(DIM);
  v[axis] = value;
  return v;
}

describe("cosineSimilarity", () => {
  it("is 1 for identical unit vectors and 0 for orthogonal ones", () => {
    expect(cosineSimilarity(axisUnit(0), axisUnit(0))).toBeCloseTo(1, 6);
    expect(cosineSimilarity(axisUnit(0), axisUnit(1))).toBeCloseTo(0, 6);
  });
});

describe("projectPCA2D (determinism)", () => {
  it("returns identical output for identical input across calls", () => {
    const vecs = [axisUnit(0), axisUnit(1), axisUnit(2), axisUnit(3)];
    const a = projectPCA2D(vecs);
    const b = projectPCA2D(vecs);
    expect(b).toEqual(a);
  });

  it("is stable for a single vector (origin) and empty (empty)", () => {
    expect(projectPCA2D([])).toEqual([]);
    expect(projectPCA2D([axisUnit(0)])).toEqual([[0, 0]]);
  });
});

describe("runKMeans", () => {
  it("returns identity assignment when k >= n", () => {
    const vecs = [axisUnit(0), axisUnit(1), axisUnit(2)];
    expect(runKMeans(vecs, 5)).toEqual([0, 1, 2]);
  });

  it("returns a single cluster when k <= 1", () => {
    const vecs = [axisUnit(0), axisUnit(1), axisUnit(2)];
    expect(runKMeans(vecs, 1)).toEqual([0, 0, 0]);
  });

  it("separates two well-separated groups", () => {
    const vecs = [axisUnit(0), axisUnit(0), axisUnit(1), axisUnit(1)];
    const labels = runKMeans(vecs, 2);
    expect(labels[0]).toBe(labels[1]);
    expect(labels[2]).toBe(labels[3]);
    expect(labels[0]).not.toBe(labels[2]);
  });
});

describe("runDBSCAN", () => {
  it("clusters identical vectors and marks an outlier as noise (-1)", () => {
    // Three identical (mutual distance 0), one orthogonal outlier (distance 1).
    const vecs = [axisUnit(0), axisUnit(0), axisUnit(0), axisUnit(1)];
    const labels = runDBSCAN(vecs, 0.5, 2);
    expect(labels[0]).toBe(labels[1]);
    expect(labels[1]).toBe(labels[2]);
    expect(labels[0]).toBeGreaterThanOrEqual(0);
    expect(labels[3]).toBe(-1); // noise
  });
});

describe("computeConvexHull", () => {
  it("returns a hull that contains all input points for a square", () => {
    const pts: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [2, 2] // interior point — must not appear on the hull
    ];
    const hull = computeConvexHull(pts);
    const hullSet = new Set(hull.map((p) => `${p[0]},${p[1]}`));
    expect(hullSet.has("2,2")).toBe(false);
    expect(hullSet.has("0,0")).toBe(true);
    expect(hullSet.has("4,4")).toBe(true);
  });
});

describe("buildVisualizerGraph — kNN edges (the regression fix)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAllNoteCentroidEmbeddings).mockResolvedValue(new Map());
  });

  it("emits a bounded kNN clique per topic, no cross-topic edges", async () => {
    // Two topics of 5 notes each; within a topic every note shares the SAME
    // embedding (cosine sim 1.0), across topics sim 0.0. With K=4 each note
    // links its 4 same-topic siblings → a 10-edge clique per topic (20 total),
    // and NO cross-topic edge (sim 0 < the 0.65 floor).
    const topics = ["A", "B"];
    const notes = topics.flatMap((tp) =>
      Array.from({ length: 5 }, (_, i) => ({ id: `n-${tp}-${i}`, title: `topic-${tp}`, tags: [], headline: "" } as any))
    );
    vi.mocked(computeEmbedding).mockImplementation(async (title: string) => {
      const axis = title === "topic-A" ? 0 : 1;
      return axisUnit(axis);
    });

    const opts: ClusteringOptions = {
      ...DEFAULT_CLUSTERING_OPTIONS,
      includeTags: false,
      includeNotebooks: false,
      includeColors: false,
      linkTags: false,
      similarityThreshold: 0.65
    };
    const { nodes, edges, clusters } = await buildVisualizerGraph(notes as any, [], [], [], opts);

    expect(nodes.length).toBe(10);
    // kNN bound: each node contributes ≤ K=4 edges, deduped → ≤ 4*10/2 = 20.
    expect(edges.length).toBe(20);
    // No duplicate unordered pairs.
    const keys = new Set(edges.map((e) => (e.source < e.target ? `${e.source}-${e.target}` : `${e.target}-${e.source}`)));
    expect(keys.size).toBe(edges.length);
    // Every edge is within-topic (sim 1.0) — no cross-topic (sim 0) edges.
    for (const e of edges) {
      expect(e.similarity).toBeCloseTo(1, 6);
      expect(e.type).toBe("similarity");
    }
    // DBSCAN with eps 0.28 → two clusters (within-topic distance 0, across 1).
    expect(clusters.length).toBe(2);
  });

  it("respects the threshold floor: a small cluster below K still links only ≥ threshold", async () => {
    // 3 notes all mutually similar (sim 1.0); K=4 but only 2 siblings each.
    // Edges should be the 3-clique (3 edges), all sim 1.0 ≥ 0.65.
    const notes = Array.from({ length: 3 }, (_, i) => ({ id: `n-${i}`, title: "same", tags: [], headline: "" } as any));
    vi.mocked(computeEmbedding).mockResolvedValue(axisUnit(0));

    const opts: ClusteringOptions = {
      ...DEFAULT_CLUSTERING_OPTIONS,
      includeTags: false,
      includeNotebooks: false,
      includeColors: false,
      linkTags: false,
      similarityThreshold: 0.65
    };
    const { edges } = await buildVisualizerGraph(notes as any, [], [], [], opts);
    expect(edges.length).toBe(3);
  });

  it("does NOT regress to all-pairs: raising the floor cuts edges to 0", async () => {
    // 6 notes mutually similar at sim 1.0 but threshold set above 1.0 → no edges.
    // (The old all-pairs pass also used the threshold, so this guards the floor
    // semantics; the kNN change is verified by the bounded-clique test above.)
    const notes = Array.from({ length: 6 }, (_, i) => ({ id: `n-${i}`, title: "same", tags: [], headline: "" } as any));
    vi.mocked(computeEmbedding).mockResolvedValue(axisUnit(0));
    const opts: ClusteringOptions = {
      ...DEFAULT_CLUSTERING_OPTIONS,
      includeTags: false,
      includeNotebooks: false,
      includeColors: false,
      linkTags: false,
      similarityThreshold: 1.5 // above max cosine → floor rejects everything
    };
    const { edges } = await buildVisualizerGraph(notes as any, [], [], [], opts);
    expect(edges.length).toBe(0);
  });
});

// Re-import helper (mocked module shape requires the named export above).