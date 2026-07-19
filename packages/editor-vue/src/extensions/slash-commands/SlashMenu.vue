<!--
  Slash-command menu (Phase 2.5). Rendered by `render.ts` via TipTap's
  `VueRenderer` while the `@tiptap/suggestion` plugin is active. Teleported to
  <body> and fixed-positioned at the cursor (the suggestion `clientRect`). The
  Suggestion plugin owns the lifecycle (onStart/onUpdate/onExit); `render.ts`
  owns keyboard routing (Arrow/Enter/Esc) and calls the exposed nav methods
  below. This component follows editor-vue's own component convention (scoped
  CSS, no Tailwind/ui-vue dependency) rather than the renderer's ui-vue
  primitives, so editor-vue stays a lower layer.
-->
<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import type { SlashItem } from "../../tool-definitions";
import { cycleIndex } from "../../utils/filter";

const props = defineProps<{
  items: SlashItem[];
  /** Suggestion's `command` — invoked with the selected item. */
  command: (item: SlashItem) => void;
  /** Live cursor rect from the suggestion plugin (null while exiting). */
  clientRect?: (() => DOMRect | null) | null;
}>();

const el = ref<HTMLElement | null>(null);
const activeIndex = ref(0);

function clamp(): void {
  if (props.items.length === 0) {
    activeIndex.value = 0;
  } else if (activeIndex.value >= props.items.length) {
    activeIndex.value = props.items.length - 1;
  }
}

function reposition(): void {
  if (!el.value) return;
  const rect = props.clientRect?.() ?? null;
  if (!rect) return;
  // Clamp so the menu stays on-screen; width is fixed (see scoped CSS).
  const menuW = el.value.offsetWidth || 240;
  const menuH = el.value.offsetHeight || 200;
  const top = Math.min(rect.bottom + 4, window.innerHeight - menuH - 8);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuW - 8));
  el.value.style.top = `${Math.max(8, top)}px`;
  el.value.style.left = `${left}px`;
}

function select(item: SlashItem): void {
  props.command(item);
}

// Exposed for `render.ts` keyboard routing.
function next(): void {
  activeIndex.value = cycleIndex(activeIndex.value, props.items.length, 1);
}
function prev(): void {
  activeIndex.value = cycleIndex(activeIndex.value, props.items.length, -1);
}
function selectActive(): void {
  const item = props.items[activeIndex.value];
  if (item) select(item);
}
defineExpose({ next, prev, selectActive });

watch(
  () => props.items,
  () => {
    activeIndex.value = 0;
    void nextTick(reposition);
  }
);

function onScroll(): void {
  reposition();
}

onMounted(() => {
  clamp();
  void nextTick(reposition);
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onScroll);
});
onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll, true);
  window.removeEventListener("resize", onScroll);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="items.length > 0"
      ref="el"
      class="slash-menu"
      contenteditable="false"
      @mousedown.prevent
    >
      <button
        v-for="(item, i) in items"
        :key="item.id"
        class="slash-item"
        :class="{ 'slash-item--active': i === activeIndex }"
        type="button"
        @click="select(item)"
        @mouseenter="activeIndex = i"
      >
        {{ item.title }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.slash-menu {
  position: fixed;
  z-index: 50;
  width: 240px;
  max-height: 240px;
  overflow-y: auto;
  padding: 4px;
  border-radius: 10px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  background: var(--color-surface-solid, rgba(24, 24, 24, 0.92));
  backdrop-filter: blur(var(--backdrop-blur-base, 24px));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  font-size: 13px;
  /* styles set inline (top/left) by reposition() */
}

.slash-item {
  display: block;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text, rgba(255, 255, 255, 0.85));
  text-align: left;
  cursor: pointer;
  font: inherit;
}

.slash-item--active {
  background: var(--color-hover, rgba(255, 255, 255, 0.08));
  color: var(--color-heading, #fff);
}
</style>