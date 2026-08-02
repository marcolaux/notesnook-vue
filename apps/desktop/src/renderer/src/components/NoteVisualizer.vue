<script setup lang="ts">
/**
 * Per-note semantic neighbourhood visualizer (right-sidebar 3rd view).
 *
 * The account-wide `VectorVisualizerModal` graphs every note. This is its local
 * counterpart: a center-and-spokes map of ONE note's immediate semantic
 * neighbourhood (the note + its ~12 nearest related notes), rendered on a 2D
 * canvas inside the narrow right sidebar. Clicking a spoke opens that note in a
 * new editor tab; a compact list of the same neighbours sits under the canvas.
 *
 * Reuses the visualizer's primitives — no new math:
 *   • `getNoteNeighbourhood` (centre centroid + KNN neighbours with cosine sim).
 *   • `projectPCA2D` over just the subset, translated so the centre sits at the
 *     origin (spoke layout).
 *   • The theme-aware canvas pattern from `VectorVisualizerModal`
 *     (`readCanvasThemeColors` + `onThemeChange`).
 *
 * Auto-fits the neighbourhood bounding box each render — no manual pan/zoom is
 * needed for ≤12 nodes in a ~280px panel. Per-tab: two split panes show two
 * different notes' neighbourhoods.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { Icon } from "@notesnook-vue/ui-vue";
import { useNotesStore } from "@/stores/notes";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { getNoteNeighbourhood, type NeighbourNode } from "@/utils/note-neighbourhood";
import { projectPCA2D } from "@/utils/vector-clustering";
import { readCanvasThemeColors, withAlpha, onThemeChange } from "@/utils/canvas-theme";
import { isReindexing } from "@/utils/vector-search";

const props = defineProps<{ noteId: string | null; tabId: string }>();
const { t } = useI18n();
const notesStore = useNotesStore();
const layout = useEditorLayoutStore();

/** Max neighbours to fetch + draw. Keeps the narrow panel legible. */
const NEIGHBOUR_LIMIT = 12;
/** Debounce before (re)loading the neighbourhood on note switches / edits. */
const LOAD_DEBOUNCE_MS = 250;

interface PlacedNeighbour extends NeighbourNode {
  /** PCA x/y relative to the centre (centre = origin). */
  rx: number;
  ry: number;
}

const centerTitle = ref<string>("");
const neighbours = ref<PlacedNeighbour[]>([]);
const loading = ref(false);
/** `disabled` = semantic search off / nothing to centre on; `empty` = centre
 *  resolved but no live neighbours. */
const disabled = ref(false);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const hoveredIndex = ref<number | null>(null);
let renderRequested = false;
let loadTimer: number | null = null;
let ro: ResizeObserver | null = null;

// --- Loading the neighbourhood ----------------------------------------------

async function loadNeighbourhood(): Promise<void> {
  const id = props.noteId;
  if (!id) {
    neighbours.value = [];
    centerTitle.value = "";
    disabled.value = false;
    return;
  }
  loading.value = true;
  try {
    const liveNoteIds = new Set(notesStore.items.map((n) => n.id));
    const result = await getNoteNeighbourhood(id, {
      limit: NEIGHBOUR_LIMIT,
      liveNoteIds,
      titleFor: (nid) => notesStore.titleOf(nid)
    });
    if (!result.center) {
      // Semantic search off, or the note couldn't be centred on.
      neighbours.value = [];
      centerTitle.value = notesStore.titleOf(id);
      disabled.value = true;
      return;
    }
    disabled.value = false;
    centerTitle.value = result.center.title;
    neighbours.value = computeLayout(result.center.vector, result.neighbours);
    requestRender();
  } catch (err) {
    console.error("[note-visualizer] load failed:", err);
    neighbours.value = [];
    disabled.value = true;
  } finally {
    loading.value = false;
  }
}

/** PCA-project the centre + neighbours and translate so the centre is at the
 *  origin; neighbours keep their relative PCA positions as spoke offsets. */
function computeLayout(centerVec: Float32Array, nb: NeighbourNode[]): PlacedNeighbour[] {
  if (nb.length === 0) return [];
  const vectors = [centerVec, ...nb.map((n) => n.vector)];
  const points = projectPCA2D(vectors);
  const center = points[0] ?? [0, 0];
  return nb.map((n, i) => {
    const p = points[i + 1] ?? [0, 0];
    return { ...n, rx: p[0] - center[0], ry: p[1] - center[1] };
  });
}

// --- Rendering --------------------------------------------------------------

function requestRender(): void {
  if (!renderRequested) {
    renderRequested = true;
    requestAnimationFrame(() => {
      renderRequested = false;
      render();
    });
  }
}

/** Ellipsize `text` to fit `maxWidth` using the current 2D context font. */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}

function render(): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return;

  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  ctx.save();
  ctx.scale(dpr, dpr);

  const theme = readCanvasThemeColors();
  ctx.fillStyle = theme.backdrop;
  ctx.fillRect(0, 0, width, height);

  const nb = neighbours.value;
  const cx = width / 2;
  const cy = height / 2;

  if (nb.length === 0) {
    ctx.restore();
    return;
  }

  // Auto-fit the spoke bounding box into the canvas (leaving room for labels).
  const padding = 34;
  const usableR = Math.min(width, height) / 2 - padding;
  let maxR = 0;
  for (const n of nb) {
    const r = Math.hypot(n.rx, n.ry);
    if (r > maxR) maxR = r;
  }
  // Guard against a degenerate fit when all neighbours sit at ~the same spot.
  const scale = maxR > 0 ? Math.min(usableR / maxR, 4) : 1;

  const toScreen = (rx: number, ry: number): [number, number] => [cx + rx * scale, cy + ry * scale];

  // 1. Edges (centre → each neighbour), thickness/alpha ∝ similarity.
  const centerRadius = 9;
  for (let i = 0; i < nb.length; i++) {
    const n = nb[i];
    if (!n) continue;
    const [nx, ny] = toScreen(n.rx, n.ry);
    const isHovered = hoveredIndex.value === i;
    const sim = Math.max(0, Math.min(1, n.similarity));
    const alpha = isHovered ? 0.95 : Math.max(0.18, sim * 0.55);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = isHovered ? theme.accent : withAlpha(theme.accent, alpha);
    ctx.lineWidth = isHovered ? 2.5 : Math.max(1, sim * 2.2);
    ctx.stroke();
  }

  // 2. Neighbour nodes.
  ctx.font = "500 11px Inter, sans-serif";
  ctx.textAlign = "center";
  for (let i = 0; i < nb.length; i++) {
    const n = nb[i];
    if (!n) continue;
    const [nx, ny] = toScreen(n.rx, n.ry);
    const isHovered = hoveredIndex.value === i;
    const sim = Math.max(0, Math.min(1, n.similarity));
    const radius = 7;

    ctx.beginPath();
    ctx.arc(nx, ny, radius, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(theme.accent, 0.35 + sim * 0.5);
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = isHovered ? 14 : 3;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = isHovered ? theme.text : withAlpha(theme.text, 0.35);
    ctx.lineWidth = isHovered ? 2 : 1;
    ctx.stroke();

    if (isHovered) {
      const label = ellipsize(ctx, n.title, width - 16);
      ctx.font = "600 11px Inter, sans-serif";
      // Backdrop halo keeps the label readable on either theme.
      ctx.lineWidth = 3;
      ctx.strokeStyle = theme.backdrop;
      ctx.strokeText(label, nx, ny + radius + 13);
      ctx.fillStyle = theme.text;
      ctx.fillText(label, nx, ny + radius + 13);
      ctx.font = "500 11px Inter, sans-serif";
    }
  }

  // 3. Centre node (drawn last so it sits on top).
  ctx.beginPath();
  ctx.arc(cx, cy, centerRadius, 0, Math.PI * 2);
  ctx.fillStyle = theme.accent;
  ctx.shadowColor = theme.accent;
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = theme.text;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Centre title — always shown, truncated to the canvas width.
  ctx.font = "600 12px Inter, sans-serif";
  ctx.textAlign = "center";
  const label = ellipsize(ctx, centerTitle.value || "", width - 12);
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeStyle = theme.backdrop;
  ctx.strokeText(label, cx, cy + centerRadius + 14);
  ctx.fillStyle = theme.text;
  ctx.fillText(label, cx, cy + centerRadius + 14);

  ctx.restore();
}

// --- Interaction ------------------------------------------------------------

function neighbourAt(e: MouseEvent): number | null {
  const canvas = canvasRef.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const cx = width / 2;
  const cy = height / 2;
  const padding = 34;
  const usableR = Math.min(width, height) / 2 - padding;
  let maxR = 0;
  for (const n of neighbours.value) {
    const r = Math.hypot(n.rx, n.ry);
    if (r > maxR) maxR = r;
  }
  const scale = maxR > 0 ? Math.min(usableR / maxR, 4) : 1;
  const hit = 12;
  for (let i = 0; i < neighbours.value.length; i++) {
    const n = neighbours.value[i];
    if (!n) continue;
    const nx = cx + n.rx * scale;
    const ny = cy + n.ry * scale;
    if ((nx - mx) ** 2 + (ny - my) ** 2 <= hit * hit) return i;
  }
  return null;
}

function onPointerMove(e: MouseEvent): void {
  const idx = neighbourAt(e);
  if (idx !== hoveredIndex.value) {
    hoveredIndex.value = idx;
    requestRender();
  }
}

function onPointerLeave(): void {
  if (hoveredIndex.value !== null) {
    hoveredIndex.value = null;
    requestRender();
  }
}

function onPointerDown(e: MouseEvent): void {
  const idx = neighbourAt(e);
  if (idx !== null) {
    const n = neighbours.value[idx];
    if (n) layout.openNote(n.noteId);
  }
}

function openNeighbour(noteId: string): void {
  layout.openNote(noteId);
}

const sortedNeighbours = computed(() =>
  neighbours.value.slice().sort((a, b) => b.similarity - a.similarity)
);

// --- Lifecycle --------------------------------------------------------------

function scheduleLoad(): void {
  if (loadTimer !== null) window.clearTimeout(loadTimer);
  loadTimer = window.setTimeout(() => {
    loadTimer = null;
    void loadNeighbourhood();
  }, LOAD_DEBOUNCE_MS);
}

let stopThemeObserver: (() => void) | null = null;

onMounted(() => {
  scheduleLoad();
  stopThemeObserver = onThemeChange(() => requestRender());
  const canvas = canvasRef.value;
  if (canvas && "ResizeObserver" in window) {
    ro = new ResizeObserver(() => requestRender());
    ro.observe(canvas);
  }
});

onBeforeUnmount(() => {
  if (loadTimer !== null) window.clearTimeout(loadTimer);
  stopThemeObserver?.();
  stopThemeObserver = null;
  ro?.disconnect();
  ro = null;
});

// Reload when the note changes (switch tab / open a different note) or the live
// note set shifts (so trashed/archived neighbours drop out).
watch(() => props.noteId, scheduleLoad);
watch(() => notesStore.items.length, scheduleLoad);
// While the embedding index is being rebuilt (model-change reindex), the
// neighbourhood is partial — show the reindexing notice instead of a misleading
// sparse graph, then reload once the reindex drains.
watch(isReindexing, (reindexing) => {
  if (!reindexing) scheduleLoad();
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-2">
    <!-- Canvas viewport -->
    <div
      class="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-glass-bg"
      :class="neighbours.length > 0 ? 'cursor-pointer' : ''"
    >
      <canvas
        ref="canvasRef"
        class="h-full w-full block"
        @mousemove="onPointerMove"
        @mouseleave="onPointerLeave"
        @mousedown="onPointerDown"
      ></canvas>

      <!-- Loading overlay -->
      <div
        v-if="loading"
        class="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm"
      >
        <div class="flex items-center gap-2 rounded-lg border border-glass-border bg-glass-surface px-3 py-1.5 text-xs text-text shadow-xl">
          <Icon name="loader" :size="14" class="animate-spin text-accent" />
          <span>{{ t("toc.visualizerLoading") }}</span>
        </div>
      </div>

      <!-- Disabled (semantic search off / nothing to centre on) -->
      <div
        v-else-if="disabled"
        class="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center"
      >
        <Icon name="network" :size="20" class="text-text-muted" />
        <p class="text-xs text-text-muted leading-relaxed">{{ t("toc.visualizerDisabled") }}</p>
      </div>

      <!-- Reindexing (embedding index being rebuilt) — the neighbourhood is
           partial until the reindex drains; the notice avoids presenting a
           misleadingly sparse map. -->
      <div
        v-else-if="isReindexing"
        class="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center"
      >
        <Icon name="loader" :size="20" class="animate-spin text-accent" />
        <p class="text-xs text-text-muted leading-relaxed">{{ t("toc.visualizerReindexing") }}</p>
      </div>

      <!-- Empty (centre resolved, no live neighbours) -->
      <div
        v-else-if="neighbours.length === 0"
        class="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center"
      >
        <Icon name="network" :size="20" class="text-text-muted" />
        <p class="text-xs text-text-muted leading-relaxed">{{ t("toc.visualizerEmpty") }}</p>
      </div>
    </div>

    <!-- Compact related-notes list -->
    <div v-if="sortedNeighbours.length > 0" class="flex min-h-0 shrink-0 flex-col">
      <div class="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        <Icon name="list" :size="11" />
        <span>{{ t("toc.related") }}</span>
      </div>
      <div class="flex min-h-0 max-h-40 flex-col gap-1 overflow-y-auto pr-1">
        <button
          v-for="(n, i) in sortedNeighbours"
          :key="n.noteId"
          type="button"
          class="flex shrink-0 items-center justify-between gap-2 rounded-md border border-glass-border bg-glass-hover px-2 py-1 text-left text-xs transition-colors hover:border-glass-active"
          :title="n.title"
          @click="openNeighbour(n.noteId)"
          @mouseenter="hoveredIndex = neighbours.indexOf(n); requestRender()"
          @mouseleave="hoveredIndex = null; requestRender()"
        >
          <span class="truncate text-text">{{ n.title }}</span>
          <span class="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
            {{ Math.round(Math.max(0, n.similarity) * 100) }}%
          </span>
        </button>
      </div>
    </div>
  </div>
</template>