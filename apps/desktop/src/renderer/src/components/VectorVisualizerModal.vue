<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from "vue";
import { useI18n } from "vue-i18n";
import { Icon } from "@notesnook-vue/ui-vue";
import { useNotesStore } from "@/stores/notes";
import { useCollectionsStore } from "@/stores/collections";
import { useColorsStore } from "@/stores/colors";
import { toColorListItem } from "@/utils/colors";
import {
  buildVisualizerGraph,
  DEFAULT_CLUSTERING_OPTIONS,
  type VisualizerNode,
  type VisualizerEdge,
  type ClusterGroup,
  type ClusteringOptions,
  cosineSimilarity
} from "@/utils/vector-clustering";
import { readCanvasThemeColors, withAlpha, onThemeChange } from "@/utils/canvas-theme";
import { isReindexing } from "@/utils/vector-search";

const emit = defineEmits<{
  (e: "close"): void;
}>();

const notesStore = useNotesStore();
const collectionsStore = useCollectionsStore();
const colorsStore = useColorsStore();
const { t } = useI18n();

const typeLabels = computed<Record<string, string>>(() => ({
  note: t("vectorViz.typeNote"),
  tag: t("vectorViz.typeTag"),
  notebook: t("vectorViz.typeNotebook"),
  color: t("vectorViz.typeColor")
}));

const options = ref<ClusteringOptions>({ ...DEFAULT_CLUSTERING_OPTIONS });
const isLoading = ref(true);

const nodes = ref<VisualizerNode[]>([]);
const edges = ref<VisualizerEdge[]>([]);
const clusters = ref<ClusterGroup[]>([]);

const selectedNode = ref<VisualizerNode | null>(null);
const hoveredNode = ref<VisualizerNode | null>(null);

// Canvas & Viewport State
const canvasRef = ref<HTMLCanvasElement | null>(null);
const viewport = ref({ x: 0, y: 0, zoom: 1 });
const isDraggingCanvas = ref(false);
const dragStart = ref({ x: 0, y: 0 });

const isDraggingNode = ref(false);
const draggedNode = ref<VisualizerNode | null>(null);

let renderRequested = false;

function requestRender(): void {
  if (!renderRequested) {
    renderRequested = true;
    requestAnimationFrame(() => {
      renderRequested = false;
      render();
    });
  }
}

// Convert World (x, y) to Screen Pixel (sx, sy)
function toScreenPos(wx: number, wy: number, width: number, height: number): [number, number] {
  return [
    width / 2 + viewport.value.x + wx * viewport.value.zoom,
    height / 2 + viewport.value.y + wy * viewport.value.zoom
  ];
}

// Graph Computation
async function refreshGraph(): Promise<void> {
  isLoading.value = true;
  try {
    const allNotes = notesStore.items;
    const allTags = collectionsStore.tags;
    const allNotebooks = collectionsStore.notebooks;
    const allColors = colorsStore.items.map(toColorListItem);

    const result = await buildVisualizerGraph(allNotes, allTags, allNotebooks, allColors, options.value);
    nodes.value = result.nodes;
    edges.value = result.edges;
    clusters.value = result.clusters;
    requestRender();
  } catch (err) {
    console.error("[vector-visualizer] Failed to compute graph:", err);
  } finally {
    isLoading.value = false;
  }
}

watch(options, () => refreshGraph(), { deep: true });

// When a model-change re-index finishes (purge + re-queue), reload the graph so
// the freshly-embedded notes appear instead of the stale/partial set. The idle
// queue keeps landing embeddings afterwards; toggling any option re-runs it.
watch(isReindexing, (reindexing, was) => {
  if (was && !reindexing) void refreshGraph();
});

// Canvas Rendering (Screen-Space Nodes for Constant Dot & Text Size)
function render(): void {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }

  ctx.save();
  ctx.scale(dpr, dpr);

  // Theme-aware canvas backdrop (flips with the active theme via
  // `--background`, read from <html>'s computed style). Replaces a hardcoded
  // `#090d16` that forced the graph dark regardless of the app theme.
  const theme = readCanvasThemeColors();

  ctx.fillStyle = theme.backdrop;
  ctx.fillRect(0, 0, width, height);

  // 1. Draw Cluster Hulls (Screen-Mapped)
  for (const cluster of clusters.value) {
    if (cluster.hullPoints.length < 3) continue;

    ctx.beginPath();
    const hp = cluster.hullPoints;
    const firstPoint = hp[0];
    if (!firstPoint) continue;

    const [fx, fy] = toScreenPos(firstPoint[0], firstPoint[1], width, height);
    ctx.moveTo(fx, fy);

    for (let i = 1; i < hp.length; i++) {
      const curr = hp[i];
      const next = hp[(i + 1) % hp.length];
      if (curr && next) {
        const [cx, cy] = toScreenPos(curr[0], curr[1], width, height);
        const [nx, ny] = toScreenPos(next[0], next[1], width, height);
        const xc = (cx + nx) / 2;
        const yc = (cy + ny) / 2;
        ctx.quadraticCurveTo(cx, cy, xc, yc);
      }
    }
    ctx.closePath();

    ctx.fillStyle = `${cluster.color}12`;
    ctx.fill();
    ctx.strokeStyle = `${cluster.color}35`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const [centX, centY] = toScreenPos(cluster.centroid[0], cluster.centroid[1], width, height);
    ctx.font = "600 12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    // Backdrop-colored halo guarantees the cluster title stays readable on
    // either theme (a vivid yellow/emerald cluster color is illegible on a
    // light backdrop without it).
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.backdrop;
    ctx.strokeText(`✦ ${cluster.title}`, centX, centY);
    ctx.fillStyle = cluster.color;
    ctx.fillText(`✦ ${cluster.title}`, centX, centY);
  }

  const activeId = hoveredNode.value?.id || selectedNode.value?.id;

  // 2. Draw Edges (Screen-Mapped)
  for (const edge of edges.value) {
    const sNode = nodes.value.find((n) => n.id === edge.source);
    const tNode = nodes.value.find((n) => n.id === edge.target);
    if (!sNode || !tNode) continue;

    const [sx, sy] = toScreenPos(sNode.x, sNode.y, width, height);
    const [tx, ty] = toScreenPos(tNode.x, tNode.y, width, height);

    const isConnected = activeId && (edge.source === activeId || edge.target === activeId);

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);

    if (edge.type === "similarity") {
      const alpha = isConnected ? 0.9 : Math.max(0.12, edge.similarity * 0.35);
      // Active/highlighted similarity edge uses the theme accent (matches the
      // app's selection color); inactive edges fade the same accent by alpha.
      ctx.strokeStyle = isConnected ? theme.accent : withAlpha(theme.accent, alpha);
      ctx.lineWidth = isConnected ? 2.5 : Math.max(1, edge.similarity * 2);
      ctx.setLineDash([]);
    } else if (edge.type === "tag") {
      ctx.strokeStyle = isConnected ? "#06b6d4" : "rgba(6, 182, 212, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
    } else {
      // Neutral relationship edge (notebook/color) — theme-muted so it reads
      // on both backdrops. Replaces a hardcoded slate rgba tuned for dark.
      ctx.strokeStyle = withAlpha(theme.textMuted, 0.35);
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
    }

    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 3. Draw Nodes (Constant Pixel Size Dots & Text Labels)
  for (const node of nodes.value) {
    const [nx, ny] = toScreenPos(node.x, node.y, width, height);

    const isHovered = hoveredNode.value?.id === node.id;
    const isSelected = selectedNode.value?.id === node.id;
    const isRelated =
      activeId &&
      (activeId === node.id ||
        edges.value.some(
          (e) => (e.source === activeId && e.target === node.id) || (e.target === activeId && e.source === node.id)
        ));

    // Constant screen pixel radius
    const radius = node.type === "note" ? 8 : node.type === "tag" ? 6 : 7;

    ctx.beginPath();
    ctx.arc(nx, ny, radius, 0, Math.PI * 2);

    let nodeColor = theme.accent;
    if (node.type === "tag") nodeColor = "#06b6d4";
    else if (node.type === "notebook") nodeColor = "#f59e0b";
    else if (node.type === "color") nodeColor = node.color || "#ec4899";

    const cluster = clusters.value.find((c) => c.id === node.clusterId);
    if (cluster) nodeColor = cluster.color;

    ctx.fillStyle = nodeColor;
    ctx.shadowColor = nodeColor;
    ctx.shadowBlur = isHovered || isSelected ? 16 : 4;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Selection ring uses the theme accent; hover uses the theme text color;
    // default is a subtle text-colored ring. All flip with the theme — the old
    // white rings were invisible on a light backdrop.
    ctx.strokeStyle = isSelected ? theme.accent : isHovered ? theme.text : withAlpha(theme.text, 0.3);
    ctx.lineWidth = isSelected || isHovered ? 2.5 : 1;
    ctx.stroke();

    // Constant screen font size — label text follows the theme so it stays
    // readable on either backdrop (hardcoded near-white/slate were dark-only).
    ctx.fillStyle = isRelated || !activeId ? theme.text : theme.textMuted;
    ctx.font = `${isHovered || isSelected ? "600" : "400"} 11px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(node.label, nx, ny + radius + 13);
  }

  ctx.restore();
}

function getCanvasMouseWorldPos(e: MouseEvent): { x: number; y: number } {
  const canvas = canvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;

  const worldX = (screenX - rect.width / 2 - viewport.value.x) / viewport.value.zoom;
  const worldY = (screenY - rect.height / 2 - viewport.value.y) / viewport.value.zoom;

  return { x: worldX, y: worldY };
}

function findNodeAt(e: MouseEvent): VisualizerNode | null {
  const canvas = canvasRef.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const mouseSx = e.clientX - rect.left;
  const mouseSy = e.clientY - rect.top;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  for (const node of nodes.value) {
    const [nsx, nsy] = toScreenPos(node.x, node.y, width, height);
    const dx = nsx - mouseSx;
    const dy = nsy - mouseSy;
    const clickRadius = 18; // Constant screen pixel hit radius
    if (dx * dx + dy * dy <= clickRadius * clickRadius) {
      return node;
    }
  }
  return null;
}

function onPointerDown(e: MouseEvent): void {
  const hitNode = findNodeAt(e);

  if (hitNode) {
    isDraggingNode.value = true;
    draggedNode.value = hitNode;
    selectedNode.value = hitNode;
    requestRender();
  } else {
    isDraggingCanvas.value = true;
    dragStart.value = { x: e.clientX - viewport.value.x, y: e.clientY - viewport.value.y };
  }
}

function onPointerMove(e: MouseEvent): void {
  if (isDraggingNode.value && draggedNode.value) {
    const pos = getCanvasMouseWorldPos(e);
    draggedNode.value.x = pos.x;
    draggedNode.value.y = pos.y;
    requestRender();
    return;
  }

  if (isDraggingCanvas.value) {
    viewport.value.x = e.clientX - dragStart.value.x;
    viewport.value.y = e.clientY - dragStart.value.y;
    requestRender();
    return;
  }

  const prevHovered = hoveredNode.value;
  hoveredNode.value = findNodeAt(e);

  if (prevHovered?.id !== hoveredNode.value?.id) {
    requestRender();
  }
}

function onPointerUp(): void {
  isDraggingCanvas.value = false;
  isDraggingNode.value = false;
  draggedNode.value = null;
}

function onWheel(e: WheelEvent): void {
  e.preventDefault();
  const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
  const nextZoom = Math.min(Math.max(0.2, viewport.value.zoom * zoomFactor), 4);
  viewport.value.zoom = nextZoom;
  requestRender();
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    emit("close");
  }
}

let stopThemeObserver: (() => void) | null = null;

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
  colorsStore.refresh();
  refreshGraph();
  // Re-render the canvas when the active theme changes (themeMode flip,
  // darkTheme/lightTheme swap, catalog install, cross-window sync) so the
  // graph follows the theme live instead of only on next open.
  stopThemeObserver = onThemeChange(() => requestRender());
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown);
  stopThemeObserver?.();
  stopThemeObserver = null;
});

const similarNotesForSelected = computed(() => {
  if (!selectedNode.value) return [];
  const sNode = selectedNode.value;

  const result: { node: VisualizerNode; similarity: number }[] = [];
  for (const n of nodes.value) {
    if (n.id === sNode.id) continue;
    const sim = cosineSimilarity(sNode.vector, n.vector);
    result.push({ node: n, similarity: sim });
  }

  return result.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
});

const selectedCluster = computed(() => {
  if (!selectedNode.value) return null;
  return clusters.value.find((c) => c.id === selectedNode.value?.clusterId) ?? null;
});

function navigateToNote(noteId: string): void {
  notesStore.selectNote(noteId);
  emit("close");
}
</script>

<template>
  <div class="absolute inset-0 z-40 flex flex-col bg-background/95 backdrop-blur-2xl text-text select-none overflow-hidden">
    <!-- Floating Top Control Bar (Glassmorphic) -->
    <div class="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 rounded-xl border border-glass-border bg-glass-surface px-4 py-2 text-xs shadow-xl backdrop-blur-2xl">
      <!-- Info Badge -->
      <div class="flex items-center gap-2 font-semibold text-text">
        <Icon name="network" :size="16" class="text-accent" />
        <span>{{ t("vectorViz.title") }}</span>
        <span class="rounded-full bg-glass-hover px-2 py-0.5 text-[10px] text-text-muted">
          {{ t("vectorViz.summary", { nodes: nodes.length, clusters: clusters.length }) }}
        </span>
      </div>

      <div class="h-4 w-px bg-glass-border"></div>

      <!-- Algorithm Selector -->
      <div class="flex items-center gap-1 bg-glass-hover p-0.5 rounded-lg">
        <button
          type="button"
          class="rounded-md px-2.5 py-1 text-xs font-medium transition-all"
          :class="options.algorithm === 'dbscan' ? 'bg-glass-active text-text font-semibold shadow-sm' : 'text-text-muted hover:text-text'"
          @click="options.algorithm = 'dbscan'"
        >
          {{ t("vectorViz.dbscan") }}
        </button>
        <button
          type="button"
          class="rounded-md px-2.5 py-1 text-xs font-medium transition-all"
          :class="options.algorithm === 'kmeans' ? 'bg-glass-active text-text font-semibold shadow-sm' : 'text-text-muted hover:text-text'"
          @click="options.algorithm = 'kmeans'"
        >
          {{ t("vectorViz.kmeans") }}
        </button>
      </div>

      <!-- Sliders -->
      <div v-if="options.algorithm === 'kmeans'" class="flex items-center gap-2">
        <span class="text-text-muted font-medium">{{ t("vectorViz.clustersK", { k: options.kmeansK }) }}</span>
        <input
          v-model.number="options.kmeansK"
          type="range"
          min="2"
          max="10"
          class="w-20 accent-accent cursor-pointer"
        />
      </div>

      <div v-else class="flex items-center gap-2">
        <span class="text-text-muted font-medium">{{ t("vectorViz.densityEps", { eps: options.dbscanEps.toFixed(2) }) }}</span>
        <input
          v-model.number="options.dbscanEps"
          type="range"
          min="0.15"
          max="0.55"
          step="0.02"
          class="w-20 accent-accent cursor-pointer"
        />
      </div>

      <div class="h-4 w-px bg-glass-border"></div>

      <!-- Similarity Cutoff Slider -->
      <div class="flex items-center gap-2">
        <span class="text-text-muted font-medium">{{ t("vectorViz.similarity", { pct: Math.round(options.similarityThreshold * 100) }) }}</span>
        <input
          v-model.number="options.similarityThreshold"
          type="range"
          min="0.50"
          max="0.95"
          step="0.05"
          class="w-20 accent-accent cursor-pointer"
        />
      </div>

      <div class="h-4 w-px bg-glass-border"></div>

      <!-- Entity Toggles -->
      <div class="flex items-center gap-3 text-text-muted">
        <label class="flex cursor-pointer items-center gap-1.5 hover:text-text">
          <input v-model="options.includeTags" type="checkbox" class="rounded accent-accent" />
          <span>{{ t("vectorViz.tags") }}</span>
        </label>
        <label class="flex cursor-pointer items-center gap-1.5 hover:text-text">
          <input v-model="options.includeNotebooks" type="checkbox" class="rounded accent-accent" />
          <span>{{ t("vectorViz.notebooks") }}</span>
        </label>
      </div>

      <div class="h-4 w-px bg-glass-border"></div>

      <button
        type="button"
        class="flex h-7 items-center gap-1.5 rounded-md bg-glass-hover px-2 text-xs text-text-muted hover:text-text transition-colors"
        :title="t('vectorViz.resetViewTitle')"
        @click="viewport = { x: 0, y: 0, zoom: 1 }; requestRender()"
      >
        <Icon name="rotate-ccw" :size="12" /> {{ t("vectorViz.reset") }}
      </button>

      <button
        type="button"
        class="grid h-7 w-7 place-items-center rounded-md text-text-muted hover:bg-glass-hover hover:text-text transition-colors"
        :title="t('vectorViz.closeTitle')"
        @click="emit('close')"
      >
        <Icon name="x" :size="16" />
      </button>
    </div>

    <!-- Main Canvas Viewport -->
    <div class="relative flex-1 cursor-grab active:cursor-grabbing">
      <canvas
        ref="canvasRef"
        class="h-full w-full block"
        @mousedown="onPointerDown"
        @mousemove="onPointerMove"
        @mouseup="onPointerUp"
        @wheel="onWheel"
      ></canvas>

      <!-- Loading overlay -->
      <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
        <div class="flex items-center gap-2 rounded-xl bg-glass-surface border border-glass-border px-4 py-2.5 text-xs text-text shadow-2xl">
          <Icon name="loader" :size="16" class="animate-spin text-accent" />
          <span>{{ t("vectorViz.computing") }}</span>
        </div>
      </div>

      <!-- Re-index banner: the embedding model changed (or semantic search was
           just enabled) and vec_notes is being rebuilt in the background. The
           graph shown is partial until the idle queue catches up. -->
      <div
        v-if="isReindexing"
        class="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-xl border border-glass-border bg-glass-surface px-4 py-2 text-xs text-text-muted shadow-xl backdrop-blur-2xl"
      >
        <Icon name="loader" :size="14" class="animate-spin text-accent" />
        <span>{{ t("vectorViz.reindexing") }}</span>
      </div>
    </div>

    <!-- Selected Node Inspector Side Drawer -->
    <div
      v-if="selectedNode"
      class="absolute right-4 top-16 bottom-4 w-80 rounded-2xl border border-glass-border bg-glass-surface/95 p-4 shadow-2xl backdrop-blur-2xl flex flex-col gap-4 z-20 text-text"
    >
      <div class="flex items-start justify-between border-b border-glass-border pb-3">
        <div class="min-w-0 flex-1">
          <span class="inline-block rounded bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent uppercase tracking-wider mb-1">
            {{ typeLabels[selectedNode.type] ?? selectedNode.type }}
          </span>
          <h3 class="truncate text-base font-semibold text-text" :title="selectedNode.label">
            {{ selectedNode.label }}
          </h3>
          <p v-if="selectedCluster" class="text-xs text-text-muted mt-0.5 flex items-center gap-1">
            <span>{{ t("vectorViz.clusterLabel", { title: selectedCluster.title }) }}</span>
          </p>
        </div>
        <button
          type="button"
          class="rounded p-1 text-text-muted hover:bg-glass-hover hover:text-text"
          @click="selectedNode = null"
        >
          <Icon name="x" :size="14" />
        </button>
      </div>

      <!-- Detail list -->
      <div class="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
        <div v-if="selectedNode.headline" class="text-text-muted italic bg-glass-hover p-2.5 rounded-lg border border-glass-border">
          "{{ selectedNode.headline }}"
        </div>

        <!-- Top Semantic Similarity Connections -->
        <div>
          <h4 class="font-semibold text-text mb-2 flex items-center justify-between">
            <span>{{ t("vectorViz.topSimilar") }}</span>
            <span class="text-[10px] text-text-muted">{{ t("vectorViz.similarityPct") }}</span>
          </h4>
          <div class="space-y-1.5">
            <div
              v-for="item in similarNotesForSelected"
              :key="item.node.id"
              class="flex items-center justify-between rounded-lg border border-glass-border bg-glass-hover p-2 hover:border-glass-active transition-colors cursor-pointer"
              @click="selectedNode = item.node; requestRender()"
            >
              <span class="truncate text-text font-medium max-w-[170px]">{{ item.node.label }}</span>
              <span class="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                {{ Math.round(item.similarity * 100) }}%
              </span>
            </div>
          </div>
        </div>

        <!-- Tags -->
        <div v-if="selectedNode.tags && selectedNode.tags.length > 0">
          <h4 class="font-semibold text-text mb-1.5">{{ t("vectorViz.associatedTags") }}</h4>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="t in selectedNode.tags"
              :key="t"
              class="rounded-md bg-glass-hover px-2 py-0.5 text-[11px] font-medium text-text-muted border border-glass-border"
            >
              #{{ t }}
            </span>
          </div>
        </div>
      </div>

      <!-- Action -->
      <button
        v-if="selectedNode.noteId"
        type="button"
        class="w-full flex items-center justify-center gap-2 rounded-xl bg-accent py-2.5 font-medium text-xs text-white shadow-lg transition-opacity hover:opacity-90"
        @click="navigateToNote(selectedNode.noteId!)"
      >
        <Icon name="file-text" :size="14" /> {{ t("vectorViz.openNote") }}
      </button>
    </div>
  </div>
</template>
