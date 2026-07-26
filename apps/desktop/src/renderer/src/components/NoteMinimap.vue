<script setup lang="ts">
/**
 * Visual DOM Minimap — scaled live clone of the note editor DOM.
 *
 * Clones the live `.ProseMirror` element from `EditorSurface` and scales it down
 * using `transform: scale(scale)` with dynamic width ratio calculation (`minimapScale`).
 * Gives 100% visual fidelity matching exact note content (text, line wraps, images,
 * code blocks, syntax highlighting, callouts, lists, math formulas).
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useEditorStore } from "@/stores/editor";
import {
  minimapScale,
  viewportRect,
  contentTranslateY,
  fractionFromPointerY
} from "@/utils/minimap";

const props = defineProps<{ tabKey: string }>();
const editorStore = useEditorStore();

const viewportEl = ref<HTMLElement | null>(null);
const cloneContainerEl = ref<HTMLElement | null>(null);
const surface = computed(() => editorStore.surfaces[props.tabKey] ?? null);

const currentScale = ref(0.15);
const layerHeight = ref(0);
const layerWidth = ref(0);
const indicatorTop = ref(0);
const indicatorHeight = ref(0);
const layerOffset = ref(0);

let roViewport: ResizeObserver | null = null;
let roContent: ResizeObserver | null = null;
let moContent: MutationObserver | null = null;
let recloneTimer: number | null = null;
let dragging = false;

function scheduleSync(): void {
  if (recloneTimer !== null) return;
  recloneTimer = window.setTimeout(() => {
    recloneTimer = null;
    syncClone();
  }, 100);
}

function syncClone(): void {
  const s = surface.value;
  const vp = viewportEl.value;
  const container = cloneContainerEl.value;
  if (!s || !vp || !container) return;

  const contentEl = s.contentEl;
  const contentWidth = contentEl.offsetWidth || contentEl.getBoundingClientRect().width || 1;
  const minimapWidth = vp.clientWidth || 1;

  const scale = minimapScale(contentWidth, minimapWidth);
  currentScale.value = scale;
  layerWidth.value = contentWidth;
  layerHeight.value = s.scrollEl.scrollHeight * scale;

  // Clone live content DOM
  const clone = contentEl.cloneNode(true) as HTMLElement;
  clone.setAttribute("aria-hidden", "true");
  clone.removeAttribute("contenteditable");
  // Remove IDs to avoid duplicated DOM identifiers
  clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));

  // Replace content of clone container
  container.replaceChildren(clone);

  applyScroll();
}

function applyScroll(): void {
  const s = surface.value;
  const vp = viewportEl.value;
  if (!s || !vp) return;

  const input = {
    scrollTop: s.scrollEl.scrollTop,
    viewportHeight: s.scrollEl.clientHeight,
    scrollHeight: s.scrollEl.scrollHeight,
    scale: currentScale.value,
    minimapHeight: vp.clientHeight
  };

  const rect = viewportRect(input);
  indicatorTop.value = rect.top;
  indicatorHeight.value = rect.height;
  layerOffset.value = contentTranslateY(input);
}

function onScroll(): void {
  applyScroll();
}

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

function attach(s: NonNullable<typeof surface.value>): void {
  const vp = viewportEl.value;
  if (!vp) return;

  roViewport = new ResizeObserver(() => scheduleSync());
  roViewport.observe(vp);
  roContent = new ResizeObserver(() => scheduleSync());
  roContent.observe(s.contentEl);

  moContent = new MutationObserver(() => scheduleSync());
  moContent.observe(s.contentEl, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true
  });

  s.scrollEl.addEventListener("scroll", onScroll, { passive: true });
  syncClone();
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
    class="relative min-h-0 flex-1 cursor-pointer overflow-hidden rounded-lg bg-glass-bg select-none"
    @mousedown="onPointerDown"
  >
    <!-- Scaled DOM Clone Container (100% full width) -->
    <div
      class="absolute left-0 top-0 pointer-events-none origin-top-left transition-transform duration-75 ease-out"
      :style="{
        width: layerWidth + 'px',
        height: (layerHeight / (currentScale || 1)) + 'px',
        transform: `translateY(${layerOffset}px) scale(${currentScale})`,
        willChange: 'transform'
      }"
    >
      <div ref="cloneContainerEl" class="minimap-clone-root opacity-90" />
    </div>

    <!-- Viewport Slider Indicator -->
    <div
      class="pointer-events-none absolute inset-x-0 rounded-md border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] shadow-sm backdrop-blur-[1px]"
      :style="{ top: indicatorTop + 'px', height: indicatorHeight + 'px' }"
    />
  </div>
</template>