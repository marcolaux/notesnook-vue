<!--
  Tag-picker popup (Phase 5.4), twin of `SlashMenu.vue`. Rendered by `render.ts`
  via TipTap's `VueRenderer` while the `#` Suggestion plugin is active.
  Teleported to <body> and fixed-positioned at the cursor. Existing tags show
  as `#title`; the synthetic "Create tag" row (isNew) shows `Create tag: "q"`
  and is visually set apart. `render.ts` owns keyboard routing and calls the
  exposed `next`/`prev`/`selectActive` below. Scoped CSS (no Tailwind) matches
  `SlashMenu.vue` so editor-vue stays a lower layer than ui-vue.
-->
<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import type { TagSuggestionItem } from "./types";
import { cycleIndex } from "../../utils/filter";

const props = defineProps<{
  items: TagSuggestionItem[];
  /** Suggestion's `command` — invoked with the selected item. */
  command: (item: TagSuggestionItem) => void;
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
  const menuW = el.value.offsetWidth || 240;
  const menuH = el.value.offsetHeight || 200;
  const top = Math.min(rect.bottom + 4, window.innerHeight - menuH - 8);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuW - 8));
  el.value.style.top = `${Math.max(8, top)}px`;
  el.value.style.left = `${left}px`;
}

function select(item: TagSuggestionItem): void {
  props.command(item);
}

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
      class="tag-menu"
      contenteditable="false"
      @mousedown.prevent
    >
      <button
        v-for="(item, i) in items"
        :key="item.id"
        class="tag-item"
        :class="{ 'tag-item--active': i === activeIndex, 'tag-item--new': item.isNew }"
        type="button"
        @click="select(item)"
        @mouseenter="activeIndex = i"
      >
        <span v-if="item.isNew" class="tag-item__new">Create tag:</span>
        <span v-else class="tag-item__hash">#</span>
        <span class="tag-item__title">{{ item.title }}</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.tag-menu {
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
}

.tag-item {
  display: flex;
  width: 100%;
  align-items: baseline;
  gap: 2px;
  padding: 7px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text, rgba(255, 255, 255, 0.85));
  text-align: left;
  cursor: pointer;
  font: inherit;
}

.tag-item--active {
  background: var(--color-hover, rgba(255, 255, 255, 0.08));
  color: var(--color-heading, #fff);
}

.tag-item__hash {
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
}

.tag-item__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-item--new .tag-item__title {
  font-style: italic;
}
</style>