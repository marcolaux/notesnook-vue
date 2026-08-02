import { computeEmbedding, getAllNoteCentroidEmbeddings } from "./vector-search";
import type { NoteListItem } from "@/stores/notes";
import type { NotebookListItem, TagListItem } from "@/utils/collections";
import type { ColorListItem } from "@/utils/colors";
import i18n from "@/i18n";

const t = i18n.global.t.bind(i18n.global);


export type NodeType = "note" | "tag" | "notebook" | "color";
export type EdgeType = "similarity" | "tag" | "notebook" | "color";

export interface VisualizerNode {
  id: string;
  label: string;
  type: NodeType;
  vector: Float32Array;
  x: number;
  y: number;
  vx?: number | undefined;
  vy?: number | undefined;
  clusterId: number;
  color?: string | undefined;
  noteId?: string | undefined;
  tags?: string[] | undefined;
  notebookId?: string | undefined;
  itemCount?: number | undefined;
  headline?: string | undefined;
}

export interface VisualizerEdge {
  source: string;
  target: string;
  similarity: number;
  type: EdgeType;
  label?: string | undefined;
}

export interface ClusterGroup {
  id: number;
  title: string;
  color: string;
  nodeIds: string[];
  keywords: string[];
  centroid: [number, number];
  hullPoints: [number, number][];
}

export interface ClusteringOptions {
  algorithm: "dbscan" | "kmeans";
  kmeansK: number;
  dbscanEps: number;
  dbscanMinSamples: number;
  similarityThreshold: number;
  includeNotes: boolean;
  includeTags: boolean;
  includeNotebooks: boolean;
  includeColors: boolean;
  linkSimilarity: boolean;
  linkTags: boolean;
  linkNotebooks: boolean;
  linkColors: boolean;
}

export const DEFAULT_CLUSTERING_OPTIONS: ClusteringOptions = {
  algorithm: "dbscan",
  kmeansK: 5,
  // Tuned for the granite-embedding-97m-multilingual model (CLS pooling, int8):
  // its cosine-similarity distribution is tighter / more peaked than the old
  // all-MiniLM-L6-v2, so the old eps=0.35 / threshold=0.6 either collapsed every
  // note into one cluster or labelled them all noise + drew a thicket of edges.
  // A smaller eps separates tighter granite clusters; the threshold now acts as
  // a *floor* for the kNN edge pass (each node links to its top-K similar), not
  // an all-pairs cutoff — see `buildVisualizerGraph`.
  dbscanEps: 0.28,
  dbscanMinSamples: 2,
  similarityThreshold: 0.65,
  includeNotes: true,
  includeTags: true,
  includeNotebooks: true,
  includeColors: true,
  linkSimilarity: true,
  linkTags: true,
  linkNotebooks: true,
  linkColors: true
};

const CLUSTER_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#8b5cf6", // purple
  "#f59e0b", // amber
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
  "#a855f7", // violet
  "#eab308"  // yellow
];

/** Cosine similarity between two unit-normalized vectors. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return Math.max(-1, Math.min(1, dot));
}

/** Cosine distance = 1 - Cosine Similarity. Range [0, 2]. */
export function cosineDistance(a: Float32Array, b: Float32Array): number {
  return 1 - cosineSimilarity(a, b);
}

/** Normalize vector to unit length in place. */
export function normalizeVector(vec: Float32Array): Float32Array {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    const val = vec[i] ?? 0;
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) {
      vec[i] = (vec[i] ?? 0) / norm;
    }
  }
  return vec;
}

/**
 * K-Means clustering algorithm for Float32Array vectors.
 */
export function runKMeans(vectors: Float32Array[], k: number, maxIter = 20): number[] {
  const n = vectors.length;
  if (n === 0) return [];
  if (k >= n) return vectors.map((_, i) => i);
  if (k <= 1) return vectors.map(() => 0);

  const dim = vectors[0]?.length ?? 384;
  const centroids: Float32Array[] = [];

  const initialVec = vectors[Math.floor(Math.random() * n)];
  if (initialVec) {
    centroids.push(new Float32Array(initialVec));
  }

  while (centroids.length < k) {
    const dists = vectors.map((v) => {
      let minDist = Infinity;
      for (const c of centroids) {
        const d = cosineDistance(v, c);
        if (d < minDist) minDist = d;
      }
      return minDist * minDist;
    });

    const sumDists = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * sumDists;
    let chosenIdx = 0;
    for (let i = 0; i < n; i++) {
      r -= dists[i] ?? 0;
      if (r <= 0) {
        chosenIdx = i;
        break;
      }
    }
    const chosenVec = vectors[chosenIdx];
    if (chosenVec) centroids.push(new Float32Array(chosenVec));
  }

  const assignments = new Array<number>(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;

    for (let i = 0; i < n; i++) {
      let minD = Infinity;
      let bestC = 0;
      const vec = vectors[i];
      if (!vec) continue;

      for (let c = 0; c < k; c++) {
        const cent = centroids[c];
        if (!cent) continue;
        const d = cosineDistance(vec, cent);
        if (d < minD) {
          minD = d;
          bestC = c;
        }
      }
      if (assignments[i] !== bestC) {
        assignments[i] = bestC;
        changed = true;
      }
    }

    if (!changed && iter > 0) break;

    const counts = new Array<number>(k).fill(0);
    const newCentroids = Array.from({ length: k }, () => new Float32Array(dim));

    for (let i = 0; i < n; i++) {
      const c = assignments[i] ?? 0;
      counts[c] = (counts[c] ?? 0) + 1;
      const targetVec = newCentroids[c];
      const sourceVec = vectors[i];
      if (targetVec && sourceVec) {
        for (let d = 0; d < dim; d++) {
          targetVec[d] = (targetVec[d] ?? 0) + (sourceVec[d] ?? 0);
        }
      }
    }

    for (let c = 0; c < k; c++) {
      const count = counts[c] ?? 0;
      const newCent = newCentroids[c];
      if (count > 0 && newCent) {
        normalizeVector(newCent);
        centroids[c] = newCent;
      }
    }
  }

  return assignments;
}

/**
 * DBSCAN (Density-Based Spatial Clustering of Applications with Noise)
 * using Cosine Distance metric.
 */
export function runDBSCAN(vectors: Float32Array[], eps: number, minSamples: number): number[] {
  const n = vectors.length;
  if (n === 0) return [];

  const UNVISITED = -2;
  const NOISE = -1;

  const labels = new Array<number>(n).fill(UNVISITED);
  let currentCluster = 0;

  function getRegion(pointIdx: number): number[] {
    const neighbors: number[] = [];
    const target = vectors[pointIdx];
    if (!target) return neighbors;
    for (let i = 0; i < n; i++) {
      const v = vectors[i];
      if (v && cosineDistance(target, v) <= eps) {
        neighbors.push(i);
      }
    }
    return neighbors;
  }

  for (let i = 0; i < n; i++) {
    if (labels[i] !== UNVISITED) continue;

    const neighbors = getRegion(i);
    if (neighbors.length < minSamples) {
      labels[i] = NOISE;
    } else {
      labels[i] = currentCluster;
      const seedQueue = [...neighbors];

      for (let j = 0; j < seedQueue.length; j++) {
        const q = seedQueue[j];
        if (q === undefined) continue;

        if (labels[q] === NOISE) {
          labels[q] = currentCluster;
        }

        if (labels[q] !== UNVISITED) continue;

        labels[q] = currentCluster;
        const qNeighbors = getRegion(q);
        if (qNeighbors.length >= minSamples) {
          for (const qn of qNeighbors) {
            if (!seedQueue.includes(qn)) {
              seedQueue.push(qn);
            }
          }
        }
      }
      currentCluster++;
    }
  }

  return labels;
}

/**
 * Deterministic seeded PRNG (mulberry32). `projectPCA2D` power-iterates from a
 * random initial PC guess; using `Math.random()` made every `refreshGraph()`
 * produce a *different* 2D layout, so the graph jumped around on each rebuild.
 * A fixed seed makes the projection stable for a given input set.
 */
function makeSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fast 2-component PCA projection for Float32Array vectors.
 */
export function projectPCA2D(vectors: Float32Array[]): [number, number][] {
  const n = vectors.length;
  if (n === 0) return [];
  if (n === 1) return [[0, 0]];
  const dim = vectors[0]?.length ?? 384;
  const rng = makeSeededRng(0x9e3779b9);

  const mean = new Float32Array(dim);
  for (let i = 0; i < n; i++) {
    const v = vectors[i];
    if (!v) continue;
    for (let d = 0; d < dim; d++) {
      mean[d] = (mean[d] ?? 0) + (v[d] ?? 0);
    }
  }
  for (let d = 0; d < dim; d++) {
    mean[d] = (mean[d] ?? 0) / n;
  }

  const centered = vectors.map((v) => {
    const c = new Float32Array(dim);
    for (let d = 0; d < dim; d++) {
      c[d] = (v[d] ?? 0) - (mean[d] ?? 0);
    }
    return c;
  });

  let pc1 = new Float32Array(dim);
  for (let d = 0; d < dim; d++) pc1[d] = rng() - 0.5;
  normalizeVector(pc1);

  for (let iter = 0; iter < 15; iter++) {
    const next1 = new Float32Array(dim);
    for (const vec of centered) {
      let dot = 0;
      for (let d = 0; d < dim; d++) dot += (vec[d] ?? 0) * (pc1[d] ?? 0);
      for (let d = 0; d < dim; d++) next1[d] = (next1[d] ?? 0) + dot * (vec[d] ?? 0);
    }
    normalizeVector(next1);
    pc1 = next1;
  }

  let pc2 = new Float32Array(dim);
  for (let d = 0; d < dim; d++) pc2[d] = rng() - 0.5;
  let dot12 = 0;
  for (let d = 0; d < dim; d++) dot12 += (pc2[d] ?? 0) * (pc1[d] ?? 0);
  for (let d = 0; d < dim; d++) pc2[d] = (pc2[d] ?? 0) - dot12 * (pc1[d] ?? 0);
  normalizeVector(pc2);

  for (let iter = 0; iter < 15; iter++) {
    const next2 = new Float32Array(dim);
    for (const vec of centered) {
      let dot = 0;
      for (let d = 0; d < dim; d++) dot += (vec[d] ?? 0) * (pc2[d] ?? 0);
      for (let d = 0; d < dim; d++) next2[d] = (next2[d] ?? 0) + dot * (vec[d] ?? 0);
    }
    let dotProj = 0;
    for (let d = 0; d < dim; d++) dotProj += (next2[d] ?? 0) * (pc1[d] ?? 0);
    for (let d = 0; d < dim; d++) next2[d] = (next2[d] ?? 0) - dotProj * (pc1[d] ?? 0);

    normalizeVector(next2);
    pc2 = next2;
  }

  const points: [number, number][] = [];
  for (const vec of centered) {
    let x = 0;
    let y = 0;
    for (let d = 0; d < dim; d++) {
      x += (vec[d] ?? 0) * (pc1[d] ?? 0);
      y += (vec[d] ?? 0) * (pc2[d] ?? 0);
    }
    points.push([x, y]);
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const TARGET_SIZE = 700;

  return points.map(([x, y]) => [
    ((x - minX) / rangeX - 0.5) * TARGET_SIZE,
    ((y - minY) / rangeY - 0.5) * TARGET_SIZE
  ]);
}

/** Compute 2D Convex Hull for cluster background bubbles. */
export function computeConvexHull(points: [number, number][]): [number, number][] {
  if (points.length <= 2) return points;

  const sorted = [...points].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));

  function crossProduct(o: [number, number], a: [number, number], b: [number, number]): number {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  }

  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      crossProduct(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (
      upper.length >= 2 &&
      crossProduct(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Extract top topic keywords from note titles in a cluster. */
export function extractClusterKeywords(labels: string[]): string[] {
  const STOP_WORDS = new Set([
    "the", "a", "an", "and", "or", "but", "is", "are", "to", "in", "for", "of", "on", "with",
    "at", "by", "from", "it", "this", "that", "my", "your", "note", "untitled", "der", "die",
    "das", "und", "ist", "in", "zu", "den", "dem", "mit", "für", "ein", "eine", "einer"
  ]);

  const freq = new Map<string, number>();

  for (const label of labels) {
    const words = label
      .toLowerCase()
      .replace(/[^\w\säöüß]/gi, " ")
      .split(/\s+/);

    for (const w of words) {
      if (w.length > 2 && !STOP_WORDS.has(w)) {
        freq.set(w, (freq.get(w) ?? 0) + 1);
      }
    }
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map((e) => e[0].charAt(0).toUpperCase() + e[0].slice(1));
}

/**
 * Builds the complete visualizer graph nodes, clusters, and connections based on options.
 */
export async function buildVisualizerGraph(
  notes: NoteListItem[],
  tags: TagListItem[],
  notebooks: NotebookListItem[],
  colors: ColorListItem[],
  options: ClusteringOptions
): Promise<{
  nodes: VisualizerNode[];
  edges: VisualizerEdge[];
  clusters: ClusterGroup[];
}> {
  const noteEmbeddings = await getAllNoteCentroidEmbeddings();
  const rawNodes: VisualizerNode[] = [];

  // 1. Build Note Nodes
  if (options.includeNotes) {
    for (const note of notes) {
      const embData = noteEmbeddings.get(note.id);
      let vec = embData?.embedding;

      if (!vec) {
        const computed = await computeEmbedding(note.title);
        if (computed) vec = computed;
      }

      if (vec) {
        const node: VisualizerNode = {
          id: `note-${note.id}`,
          label: note.title || "Untitled Note",
          type: "note",
          vector: vec,
          x: 0,
          y: 0,
          clusterId: 0,
          noteId: note.id,
          tags: note.tags,
          headline: note.headline
        };
        if (note.color?.colorCode) {
          node.color = note.color.colorCode;
        }
        rawNodes.push(node);
      }
    }
  }

  // 2. Build Tag Nodes (Hybrid Centroid: note vectors + label vector)
  if (options.includeTags) {
    for (const tag of tags) {
      const labelVec = await computeEmbedding(`Tag ${tag.title}`);
      const notesWithTag = rawNodes.filter((n) => n.tags?.includes(tag.title));

      const dim = 384;
      const combined = new Float32Array(dim);

      if (notesWithTag.length > 0) {
        for (const nNode of notesWithTag) {
          for (let d = 0; d < dim; d++) combined[d] = (combined[d] ?? 0) + (nNode.vector[d] ?? 0);
        }
        for (let d = 0; d < dim; d++) combined[d] = (combined[d] ?? 0) / notesWithTag.length;
      }

      if (labelVec) {
        for (let d = 0; d < dim; d++) {
          const lVal = labelVec[d] ?? 0;
          const cVal = combined[d] ?? 0;
          combined[d] = notesWithTag.length > 0 ? cVal * 0.7 + lVal * 0.3 : lVal;
        }
      }

      normalizeVector(combined);

      rawNodes.push({
        id: `tag-${tag.id}`,
        label: `#${tag.title}`,
        type: "tag",
        vector: combined,
        x: 0,
        y: 0,
        clusterId: 0,
        itemCount: notesWithTag.length
      });
    }
  }

  // 3. Build Notebook Nodes
  if (options.includeNotebooks) {
    for (const nb of notebooks) {
      const labelVec = await computeEmbedding(`Notebook ${nb.title}`);
      const dim = 384;
      const vec = labelVec ? new Float32Array(labelVec) : new Float32Array(dim);
      normalizeVector(vec);

      rawNodes.push({
        id: `nb-${nb.id}`,
        label: `📓 ${nb.title}`,
        type: "notebook",
        vector: vec,
        x: 0,
        y: 0,
        clusterId: 0
      });
    }
  }

  // 4. Build Color Nodes
  if (options.includeColors) {
    for (const col of colors) {
      const labelVec = await computeEmbedding(`Color ${col.title}`);
      const dim = 384;
      const vec = labelVec ? new Float32Array(labelVec) : new Float32Array(dim);
      normalizeVector(vec);

      rawNodes.push({
        id: `col-${col.id}`,
        label: col.title,
        type: "color",
        vector: vec,
        x: 0,
        y: 0,
        clusterId: 0,
        color: col.colorCode
      });
    }
  }

  if (rawNodes.length === 0) {
    return { nodes: [], edges: [], clusters: [] };
  }

  // 5. Run Clustering (K-Means vs DBSCAN)
  const vectors = rawNodes.map((n) => n.vector);
  let clusterAssignments: number[] = [];

  if (options.algorithm === "kmeans") {
    clusterAssignments = runKMeans(vectors, options.kmeansK);
  } else {
    clusterAssignments = runDBSCAN(vectors, options.dbscanEps, options.dbscanMinSamples);
  }

  for (let i = 0; i < rawNodes.length; i++) {
    const rawNode = rawNodes[i];
    if (rawNode) {
      rawNode.clusterId = clusterAssignments[i] ?? 0;
    }
  }

  // 6. Project 384D to 2D Canvas positions
  const pos2D = projectPCA2D(vectors);
  for (let i = 0; i < rawNodes.length; i++) {
    const pos = pos2D[i];
    const rawNode = rawNodes[i];
    if (pos && rawNode) {
      rawNode.x = pos[0];
      rawNode.y = pos[1];
    }
  }

  // 7. Calculate Edge Connections
  const edges: VisualizerEdge[] = [];
  const edgeSet = new Set<string>();

  // A. Semantic Vector Similarity Edges — kNN, NOT all-pairs.
  // The old pass linked *every* pair with sim ≥ threshold, an O(n²) blow-up that
  // drew a thicket of lines across the whole graph (especially after the granite
  // model swap tightened the cosine distribution and pushed many more pairs over
  // the cutoff). Instead each node links to its K most-similar neighbours, and
  // only when sim ≥ `similarityThreshold` (now a *floor*, not an all-pairs
  // cutoff). Yields ≈ K·N/2 edges — bounded, legible, model-agnostic.
  if (options.linkSimilarity) {
    const K = 4;
    for (let i = 0; i < rawNodes.length; i++) {
      const n1 = rawNodes[i];
      if (!n1) continue;
      // Rank every other node by similarity to n1.
      const ranked: { idx: number; sim: number }[] = [];
      for (let j = 0; j < rawNodes.length; j++) {
        if (j === i) continue;
        const n2 = rawNodes[j];
        if (!n2) continue;
        ranked.push({ idx: j, sim: cosineSimilarity(n1.vector, n2.vector) });
      }
      ranked.sort((a, b) => b.sim - a.sim);
      for (let k = 0; k < Math.min(K, ranked.length); k++) {
        const entry = ranked[k];
        if (!entry || entry.sim < options.similarityThreshold) break;
        const n2 = rawNodes[entry.idx];
        if (!n2) continue;
        // Dedup unordered pairs (a-b === b-a) so we don't double-draw.
        const key = n1.id < n2.id ? `${n1.id}-${n2.id}` : `${n2.id}-${n1.id}`;
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        edges.push({
          source: n1.id,
          target: n2.id,
          similarity: entry.sim,
          type: "similarity",
          label: t("vectorViz.matchPct", { pct: Math.round(entry.sim * 100) })
        });
      }
    }
  }

  // B. Tag Edges
  if (options.linkTags) {
    const noteNodes = rawNodes.filter((n) => n.type === "note");
    for (let i = 0; i < noteNodes.length; i++) {
      const n1 = noteNodes[i];
      if (!n1) continue;
      for (let j = i + 1; j < noteNodes.length; j++) {
        const n2 = noteNodes[j];
        if (!n2) continue;
        const sharedTags = n1.tags?.filter((t) => n2.tags?.includes(t)) ?? [];
        if (sharedTags.length > 0) {
          const key = n1.id < n2.id ? `${n1.id}-${n2.id}` : `${n2.id}-${n1.id}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({
              source: n1.id,
              target: n2.id,
              similarity: 1.0,
              type: "tag",
              label: `#${sharedTags.join(", #")}`
            });
          }
        }
      }
    }
  }

  // 8. Build Cluster Groups
  const clusterMap = new Map<number, VisualizerNode[]>();
  for (const n of rawNodes) {
    let list = clusterMap.get(n.clusterId);
    if (!list) {
      list = [];
      clusterMap.set(n.clusterId, list);
    }
    list.push(n);
  }

  const clusters: ClusterGroup[] = [];
  let colorIdx = 0;

  for (const [cId, cNodes] of clusterMap.entries()) {
    if (cId === -1) continue; // Skip DBSCAN noise cluster

    const points: [number, number][] = cNodes.map((n) => [n.x, n.y]);
    const hull = computeConvexHull(points);
    const keywords = extractClusterKeywords(cNodes.map((n) => n.label));

    let cx = 0;
    let cy = 0;
    for (const p of points) {
      cx += p[0];
      cy += p[1];
    }
    cx /= points.length;
    cy /= points.length;

    const clusterColor = CLUSTER_COLORS[colorIdx % CLUSTER_COLORS.length] ?? "#6366f1";
    colorIdx++;

    const title = keywords.length > 0 ? keywords.join(" & ") : t("vectorViz.clusterN", { n: cId + 1 });

    clusters.push({
      id: cId,
      title,
      color: clusterColor,
      nodeIds: cNodes.map((n) => n.id),
      keywords,
      centroid: [cx, cy],
      hullPoints: hull
    });
  }

  return { nodes: rawNodes, edges, clusters };
}
