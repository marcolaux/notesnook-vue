<!--
  Omnibar dropdown — the unified title-bar picker's result list. Purely
  presentational: the headless `useOmnibarStore` owns state; this renders the
  mode's `items` with keyboard-nav highlight + a notes-mode "View all results"
  footer. Teleported to <body> and positioned under the title-bar input by the
  host (`GlobalSearchInput`) via the left/top/width props (cloned from the former
  `SearchDropdown`).

  Row rendering is mode-conditional:
    notes rows carry pre-rendered `titleHtml`/`snippetHtml` (escaped + `<mark>`-
      wrapped by `matchesToHtml`/`snippetHtml` in the store) → `v-html` (safe by
      construction — see `@contracts/search`). NEVER feed raw note text to v-html.
    every other mode renders a plain `label` + an uppercase `group` (command
      group / collection note count / tab kind) exactly like the former
      `CommandPalette` rows.

  Empty-state copy is per-mode. The "View all results" footer is notes-mode only.
-->
<script setup lang="ts">
import { ref, watch, computed } from "vue";
import type { OmnibarItem, OmnibarMode } from "@/stores/omnibar";

const props = defineProps<{
  items: OmnibarItem[];
  activeIndex: number;
  left: number;
  top: number;
  width: number;
  mode: OmnibarMode;
}>();
const emit = defineEmits<{
  pick: [index: number];
  openAll: [];
  hover: [index: number];
}>();

const root = ref<HTMLElement | null>(null);

const emptyText = computed(() => {
  switch (props.mode) {
    case "notes":
      return "No results";
    case "commands":
      return "No matching commands";
    case "tags":
      return "No matching tags";
    case "notebooks":
      return "No matching notebooks";
    case "tabs":
      return "No open tabs or recent notes";
  }
});

// Keep the active row visible within the scrollable list.
watch(
  () => props.activeIndex,
  () => {
    root.value?.querySelector(".omnibar-dropdown__item.is-active")?.scrollIntoView({ block: "nearest" });
  },
  { flush: "post" }
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.items.length > 0 || props.mode !== 'notes'"
      ref="root"
      class="omnibar-dropdown"
      :style="{ left: props.left + 'px', top: props.top + 'px', width: props.width + 'px' }"
      @mousedown.prevent
    >
      <div class="omnibar-dropdown__list">
        <button
          v-for="(item, i) in props.items"
          :key="item.key"
          type="button"
          class="omnibar-dropdown__item"
          :class="{
            'is-active': i === props.activeIndex,
            'omnibar-dropdown__item--note': item.mode === 'notes'
          }"
          @mouseenter="emit('hover', i)"
          @click="emit('pick', i)"
        >
          <template v-if="item.titleHtml !== undefined">
            <span class="omnibar-dropdown__title" v-html="item.titleHtml" />
            <span class="omnibar-dropdown__snippet" v-html="item.snippetHtml" />
          </template>
          <template v-else>
            <span class="omnibar-dropdown__label">{{ item.label }}</span>
            <span v-if="item.group" class="omnibar-dropdown__group">{{ item.group }}</span>
          </template>
        </button>
        <div v-if="props.items.length === 0" class="omnibar-dropdown__empty">{{ emptyText }}</div>
      </div>
      <button
        v-if="props.mode === 'notes' && props.items.length > 0"
        type="button"
        class="omnibar-dropdown__footer"
        @click="emit('openAll')"
      >
        View all results <span class="omnibar-dropdown__kbd">↵</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.omnibar-dropdown {
  position: fixed;
  z-index: 60;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 10px;
  /* Paragraph-derived tint (dark in light theme / light in dark theme) so the
     dropdown outline reads on both acrylics — reverses the old
     `var(--color-border)` which was white-in-light / dark-in-dark. */
  border: 1px solid color-mix(in oklab, var(--paragraph) 14%, transparent);
  background: var(--color-surface-solid, rgba(24, 24, 24, 0.92));
  backdrop-filter: blur(var(--backdrop-blur-base, 24px));
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  font-size: 12px;
}
.omnibar-dropdown__list {
  overflow-y: auto;
  padding: 4px;
}
.omnibar-dropdown__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
/* Two-line note rows stack title over snippet (the former SearchDropdown look). */
.omnibar-dropdown__item--note {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.omnibar-dropdown__item.is-active {
  background: var(--color-hover, rgba(255, 255, 255, 0.08));
  color: var(--color-heading, #fff);
}
.omnibar-dropdown__title {
  font-weight: 600;
  color: var(--color-heading, #fff);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}
.omnibar-dropdown__snippet {
  color: var(--color-text-muted, rgba(255, 255, 255, 0.55));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}
.omnibar-dropdown__label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnibar-dropdown__group {
  flex: none;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.45));
}
.omnibar-dropdown__empty {
  padding: 12px 10px;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.45));
}
.omnibar-dropdown__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-top: 1px solid color-mix(in oklab, var(--paragraph) 14%, transparent);
  background: transparent;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.55));
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.omnibar-dropdown__footer:hover {
  background: var(--color-hover, rgba(255, 255, 255, 0.06));
}
.omnibar-dropdown__kbd {
  font-size: 10px;
  opacity: 0.7;
}
:deep(.find-match) {
  background: rgba(250, 204, 21, 0.35);
  border-radius: 2px;
  color: inherit;
}
</style>