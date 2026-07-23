<script setup lang="ts">
/**
 * VS-Code-style minimap — the "Minimap" mode of the per-tab right sidebar.
 *
 * Rather than cloning the editor's HTML (the node-views — images, embeds,
 * tables, task-lists, code blocks — are Vue components that don't mount in a
 * static clone, so a cloned+scaled rendering is structurally wrong), this
 * walks the LIVE `.ProseMirror` DOM, measures each top-level block's real
 * height, and renders **placeholder line-bar glyphs** sized to match. So the
 * minimap is an accurate vertical map of what's on screen: a 5-line paragraph
 * shows five thin bars, a heading shows a short accent bar, an image shows a
 * rectangle, a list shows indented bars, etc. — and block heights/positions
 * track the editor exactly.
 *
 * The editor DOM is reached via the per-tab {@link EditorSurface} in
 * `useEditorStore` (the sidebar is a SIBLING of the editor). Glyphs are
 * rebuilt on content mutation (a `MutationObserver` on `.ProseMirror`) + on
 * layout resize (`ResizeObserver`s), debounced. The viewport slider uses the
 * pure `utils/minimap.ts` geometry; `contentTranslateY` shifts the glyph layer
 * so the slider stays aligned with the editor's actual viewport.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useEditorStore } from "@/stores/editor";
import {
  viewportRect,
  contentTranslateY,
  fractionFromPointerY,
  scrollTopFromFraction
} from "@/utils/minimap";

const props = defineProps<{ tabKey: string }>();
const editorStore = useEditorStore();

const viewportEl = ref<HTMLElement | null>(null);
const surface = computed(() => editorStore.surfaces[props.tabKey] ?? null);

/** Minimap pixels per editor text line. Lower = denser (more of the doc
 *  visible); VS-Code uses ~1.5–3px. */
const MINIMAP_LINE_PX = 3;
/** Editor body line height (`.ProseMirror` is 1rem × 1.7 ≈ 27px). */
const EDITOR_LINE_PX = 27;
/** Fixed vertical scale — minimap line px / editor line px. */
const GLYPH_SCALE = MINIMAP_LINE_PX / EDITOR_LINE_PX;

type BlockKind =
  | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
  | "p" | "list" | "tasklist" | "quote" | "code" | "table"
  | "image" | "embed" | "hr" | "unknown";

interface BlockGlyph {
  kind: BlockKind;
  /** Top within the glyph layer (px, already × scale, scroll-invariant). */
  top: number;
  /** Glyph height (px, × scale). */
  height: number;
  /** Approx visible text lines (drives the bar count). */
  lineCount: number;
  /** Indent level (lists / quotes). */
  indent: number;
}

interface Bar {
  widthPct: number;
  cls: string;
}

const glyphs = ref<BlockGlyph[]>([]);
/** Glyph layer height = scrollEl.scrollHeight × scale. */
const layerHeight = ref(0);
const indicatorTop = ref(0);
const indicatorHeight = ref(0);
/** Glyph layer translateY (so the slider aligns with the editor viewport). */
const layerOffset = ref(0);

let roViewport: ResizeObserver | null = null;
let roContent: ResizeObserver | null = null;
let moContent: MutationObserver | null = null;
let recloneTimer: number | null = null;
let dragging = false;

function scheduleRebuild(): void {
  if (recloneTimer !== null) return;
  recloneTimer = window.setTimeout(() => {
    recloneTimer = null;
    rebuild();
  }, 200);
}

/** Classify a top-level `.ProseMirror` child into a glyph kind + line count. */
function describeBlock(el: HTMLElement, height: number): { kind: BlockKind; lineCount: number; indent: number } {
  const tag = el.tagName.toLowerCase();
  const lines = Math.max(1, Math.round(height / EDITOR_LINE_PX));
  if (/^h[1-6]$/.test(tag)) return { kind: tag as BlockKind, lineCount: 1, indent: 0 };
  if (tag === "p") return { kind: "p", lineCount: lines, indent: 0 };
  if (tag === "ul" || tag === "ol") {
    const isTask = el.classList.contains("checklist") || !!el.querySelector(".checklist--item");
    return { kind: isTask ? "tasklist" : "list", lineCount: lines, indent: 1 };
  }
  if (tag === "blockquote") return { kind: "quote", lineCount: lines, indent: 1 };
  if (tag === "pre") return { kind: "code", lineCount: lines, indent: 0 };
  if (tag === "table") return { kind: "table", lineCount: lines, indent: 0 };
  if (tag === "hr") return { kind: "hr", lineCount: 1, indent: 0 };
  if (tag === "img") return { kind: "image", lineCount: 1, indent: 0 };
  if (tag === "iframe") return { kind: "embed", lineCount: 1, indent: 0 };
  // Node-view wrapper divs (image / embed / table / code / tasklist) — detect
  // by their inner content.
  if (el.querySelector("img")) return { kind: "image", lineCount: 1, indent: 0 };
  if (el.querySelector("iframe")) return { kind: "embed", lineCount: 1, indent: 0 };
  if (el.querySelector("table")) return { kind: "table", lineCount: lines, indent: 0 };
  if (el.querySelector("pre")) return { kind: "code", lineCount: lines, indent: 0 };
  if (el.classList.contains("tasklist-wrapper") || el.querySelector("ul.checklist")) {
    return { kind: "tasklist", lineCount: lines, indent: 1 };
  }
  return { kind: "unknown", lineCount: lines, indent: 0 };
}

/** Placeholder bars for a glyph — thin gray "text lines", tapered on the last. */
function textBars(n: number, cls: string): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < n; i++) {
    bars.push({ widthPct: i === n - 1 ? 60 : 95, cls });
  }
  return bars;
}

/** Bars to render for a glyph, by kind. */
function barsFor(g: BlockGlyph): Bar[] {
  const text = "minimap-bar";
  switch (g.kind) {
    case "h1": return [{ widthPct: 90, cls: "minimap-bar--heading" }];
    case "h2": return [{ widthPct: 78, cls: "minimap-bar--heading" }];
    case "h3": return [{ widthPct: 66, cls: "minimap-bar--heading" }];
    case "h4": case "h5": case "h6":
      return [{ widthPct: 54, cls: "minimap-bar--heading" }];
    case "image": case "embed": return [{ widthPct: 100, cls: "minimap-bar--media" }];
    case "hr": return [{ widthPct: 100, cls: "minimap-bar--hr" }];
    case "code": return textBars(g.lineCount, "minimap-bar--code");
    case "table": return textBars(g.lineCount, "minimap-bar--code");
    case "quote": return textBars(g.lineCount, text);
    case "list": return textBars(g.lineCount, text);
    case "tasklist": return textBars(g.lineCount, "minimap-bar--task");
    case "p": default: return textBars(g.lineCount, text);
  }
}

/** Walk the live `.ProseMirror` blocks, measure each, build the glyph list. */
function rebuild(): void {
  const s = surface.value;
  const vp = viewportEl.value;
  if (!s || !vp) return;
  const scroller = s.scrollEl;
  const content = s.contentEl;
  const scrollerRect = scroller.getBoundingClientRect();
  const out: BlockGlyph[] = [];
  for (const child of Array.from(content.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const r = child.getBoundingClientRect();
    if (r.height <= 0) continue;
    // Scroll-invariant content position: viewport-relative + scrollTop.
    const top = (r.top - scrollerRect.top + scroller.scrollTop) * GLYPH_SCALE;
    // Floor so thin blocks (HR, empty paragraphs) stay at least visible.
    const height = Math.max(r.height * GLYPH_SCALE, 1.5);
    const { kind, lineCount, indent } = describeBlock(child, r.height);
    out.push({ kind, top, height, lineCount, indent });
  }
  glyphs.value = out;
  layerHeight.value = scroller.scrollHeight * GLYPH_SCALE;
  applyScroll();
}

/** Recompute the viewport slider + glyph-layer offset from the editor scroll. */
function applyScroll(): void {
  const s = surface.value;
  const vp = viewportEl.value;
  if (!s || !vp) return;
  const rect = viewportRect({
    scrollTop: s.scrollEl.scrollTop,
    viewportHeight: s.scrollEl.clientHeight,
    scrollHeight: s.scrollEl.scrollHeight,
    scale: GLYPH_SCALE,
    minimapHeight: vp.clientHeight
  });
  indicatorTop.value = rect.top;
  indicatorHeight.value = rect.height;
  layerOffset.value = contentTranslateY({
    scrollTop: s.scrollEl.scrollTop,
    viewportHeight: s.scrollEl.clientHeight,
    scrollHeight: s.scrollEl.scrollHeight,
    scale: GLYPH_SCALE,
    minimapHeight: vp.clientHeight
  });
}

function onScroll(): void {
  applyScroll();
}

// --- pointer drag → scroll the editor ---------------------------------------
function pointerFraction(clientY: number): number {
  const vp = viewportEl.value;
  if (!vp) return 0;
  const rect = vp.getBoundingClientRect();
  return fractionFromPointerY(clientY - rect.top, rect.height, indicatorHeight.value);
}

function scrollToFraction(frac: number): void {
  const s = surface.value;
  if (!s) return;
  s.scrollToFraction(frac);
  applyScroll();
}

function onPointerDown(e: MouseEvent): void {
  if (!surface.value) return;
  dragging = true;
  scrollToFraction(pointerFraction(e.clientY));
  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);
}

function onPointerMove(e: MouseEvent): void {
  if (!dragging) return;
  scrollToFraction(pointerFraction(e.clientY));
}

function onPointerUp(): void {
  dragging = false;
  window.removeEventListener("mousemove", onPointerMove);
  window.removeEventListener("mouseup", onPointerUp);
}

/** Attach observers/listeners to a freshly-available surface. Must run after
 *  the template mounts so the viewport element ref is bound. */
function attach(s: NonNullable<typeof surface.value>): void {
  const vp = viewportEl.value;
  if (!vp) return; // not mounted yet — `onMounted` / the surface watch retries
  roViewport = new ResizeObserver(() => scheduleRebuild());
  roViewport.observe(vp);
  roContent = new ResizeObserver(() => scheduleRebuild());
  roContent.observe(s.contentEl);
  // ProseMirror mutates the DOM on every edit → debounced rebuild keeps the
  // glyphs in sync with text changes (not just layout resize).
  moContent = new MutationObserver(() => scheduleRebuild());
  moContent.observe(s.contentEl, { subtree: true, childList: true, characterData: true });
  s.scrollEl.addEventListener("scroll", onScroll, { passive: true });
  rebuild();
}

function detach(): void {
  const s = surface.value;
  if (s) s.scrollEl.removeEventListener("scroll", onScroll);
  roViewport?.disconnect();
  roContent?.disconnect();
  moContent?.disconnect();
  roViewport = roContent = moContent = null;
  if (recloneTimer !== null) {
    clearTimeout(recloneTimer);
    recloneTimer = null;
  }
}

// Attach once mounted (the surface is usually already registered when the
// sidebar opens — refs are bound here so `observe` never gets null). Then
// re-attach when the surface appears/disappears (editor mount/unmount/tab
// switch) — NOT `immediate`, to avoid running before the template mounts.
onMounted(() => {
  if (surface.value) attach(surface.value);
});

watch(surface, (s, prev) => {
  if (prev) detach();
  if (s) attach(s);
});

onBeforeUnmount(() => {
  detach();
  window.removeEventListener("mousemove", onPointerMove);
  window.removeEventListener("mouseup", onPointerUp);
});
</script>

<template>
  <div
    ref="viewportEl"
    class="relative min-h-0 flex-1 cursor-pointer overflow-hidden rounded-lg bg-glass-bg"
    @mousedown="onPointerDown"
  >
    <!-- glyph layer: measured block glyphs, translated to track the editor viewport -->
    <div
      class="absolute inset-x-0 top-0"
      :style="{ height: layerHeight + 'px', transform: `translateY(${layerOffset}px)` }"
    >
      <div
        v-for="(g, i) in glyphs"
        :key="i"
        class="minimap-glyph absolute flex flex-col gap-px overflow-hidden"
        :class="{
          'minimap-glyph--quote': g.kind === 'quote',
          'minimap-glyph--indent': g.indent > 0
        }"
        :style="{ top: g.top + 'px', height: g.height + 'px' }"
      >
        <div
          v-for="(bar, bi) in barsFor(g)"
          :key="bi"
          class="minimap-bar flex-1"
          :class="bar.cls"
          :style="{ width: bar.widthPct + '%' }"
        />
      </div>
    </div>

    <!-- viewport slider -->
    <div
      class="pointer-events-none absolute inset-x-0 rounded-md border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]"
      :style="{ top: indicatorTop + 'px', height: indicatorHeight + 'px' }"
    />
  </div>
</template>