<!--
  Global-search dropdown (cloned from the CommandPalette pattern). Purely
  presentational: the headless search store owns state; this renders the ranked
  result rows (note title + a highlighted body snippet) with keyboard-nav
  highlight + a "View all results" footer. Teleported to <body> and positioned
  under the title-bar input by the host (`GlobalSearchInput`) via the left/top/
  width props.

  Snippets are rendered via `v-html` using `matchesToHtml` / `snippetHtml`
  (`@contracts/search`) — those helpers escape every fragment and wrap the match
  in `<mark class="find-match">`, so a note with literal `<`/`>` can't inject
  markup. NEVER feed raw `Match` fragments to `v-html`.
-->
<script setup lang="ts">
import { ref, watch } from "vue";
import { matchesToHtml, snippetHtml, type HighlightedResult } from "@contracts/search";

const props = defineProps<{
  results: HighlightedResult[];
  activeIndex: number;
  left: number;
  top: number;
  width: number;
}>();
const emit = defineEmits<{
  pick: [index: number];
  openAll: [];
  hover: [index: number];
}>();

const root = ref<HTMLElement | null>(null);

// Keep the active row visible within the scrollable list.
watch(
  () => props.activeIndex,
  () => {
    root.value?.querySelector(".search-dropdown__item.is-active")?.scrollIntoView({ block: "nearest" });
  },
  { flush: "post" }
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.results.length > 0"
      ref="root"
      class="search-dropdown"
      :style="{ left: props.left + 'px', top: props.top + 'px', width: props.width + 'px' }"
      @mousedown.prevent
    >
      <div class="search-dropdown__list">
        <button
          v-for="(r, i) in props.results"
          :key="r.id"
          type="button"
          class="search-dropdown__item"
          :class="{ 'is-active': i === props.activeIndex }"
          @mouseenter="emit('hover', i)"
          @click="emit('pick', i)"
        >
          <span class="search-dropdown__title" v-html="r.title.length ? matchesToHtml(r.title) : 'Untitled'" />
          <span class="search-dropdown__snippet" v-html="snippetHtml(r)" />
        </button>
      </div>
      <button type="button" class="search-dropdown__footer" @click="emit('openAll')">
        View all results <span class="search-dropdown__kbd">↵</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.search-dropdown {
  position: fixed;
  z-index: 60;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  background: var(--color-surface-solid, rgba(24, 24, 24, 0.92));
  backdrop-filter: blur(var(--backdrop-blur-base, 24px));
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  font-size: 12px;
}
.search-dropdown__list {
  overflow-y: auto;
  padding: 4px;
}
.search-dropdown__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text, rgba(255, 255, 255, 0.85));
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.search-dropdown__item.is-active {
  background: var(--color-hover, rgba(255, 255, 255, 0.08));
  color: var(--color-heading, #fff);
}
.search-dropdown__title {
  font-weight: 600;
  color: var(--color-heading, #fff);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-dropdown__snippet {
  color: var(--color-text-muted, rgba(255, 255, 255, 0.55));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-dropdown__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  background: transparent;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.55));
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.search-dropdown__footer:hover {
  background: var(--color-hover, rgba(255, 255, 255, 0.06));
}
.search-dropdown__kbd {
  font-size: 10px;
  opacity: 0.7;
}
:deep(.find-match) {
  background: rgba(250, 204, 21, 0.35);
  border-radius: 2px;
  color: inherit;
}
</style>