<!--
  Global-search input — lives in the title-bar center slot. The headless
  `useSearchStore` owns state; this binds the input to it and hosts the
  `SearchDropdown` (teleported, anchored under the input). Keyboard nav mirrors
  the command palette: ↑/↓ move, Enter opens the active result (or, with no
  results, opens a Search Results tab), Esc closes. A subtle platform-aware
  shortcut hint (⌘⌥F on macOS, Ctrl+Alt+F elsewhere) shows in the field when
  empty + unfocused; the global Ctrl/Cmd+Alt+F hotkey is registered in
  `TitleBar.vue` (it bumps `search.focusSignal`, watched below).
-->
<script setup lang="ts">
import { ref, watch } from "vue";
import { useSearchStore } from "@/stores/search";
import { useTitleBarStore } from "@/stores/titlebar";
import SearchDropdown from "./SearchDropdown.vue";

const search = useSearchStore();
const titlebar = useTitleBarStore();

const input = ref<HTMLInputElement | null>(null);
const focused = ref(false);
// Dropdown anchor (the input's bounding rect), measured when the dropdown opens.
const left = ref(0);
const top = ref(0);
const width = ref(0);

const shortcut = titlebar.isMacos ? "⌘⌥F" : "Ctrl+Alt+F";
const showHint = () => !focused.value && !search.query;

function measure(): void {
  const r = input.value?.getBoundingClientRect();
  if (!r) return;
  left.value = r.left;
  top.value = r.bottom + 4;
  width.value = r.width;
}

function onInput(e: Event): void {
  search.setQuery((e.target as HTMLInputElement).value);
}

function onKeydown(e: KeyboardEvent): void {
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      search.next();
      break;
    case "ArrowUp":
      e.preventDefault();
      search.prev();
      break;
    case "Enter":
      e.preventDefault();
      if (search.results.length > 0) search.openResult();
      else search.openResultsTab();
      break;
    case "Escape":
      e.preventDefault();
      search.close();
      input.value?.blur();
      break;
  }
}

function onFocus(): void {
  focused.value = true;
  if (search.query.trim()) search.open = true;
}
function onBlur(): void {
  focused.value = false;
  search.close();
}

// Hotkey / palette command bumps `focusSignal` → focus the input + open if there
// is a query (mirrors the NotesList `focusSearchSignal` watch).
watch(
  () => search.focusSignal,
  () => {
    input.value?.focus();
    if (search.query.trim()) search.open = true;
  }
);

// Measure the anchor each time the dropdown opens so it tracks the input
// (window resize / sidebar collapse shift the input's position).
watch(
  () => search.open,
  (isOpen) => {
    if (isOpen) measure();
  }
);
</script>

<template>
  <div class="global-search titlebar-no-drag relative flex-1">
    <input
      ref="input"
      type="text"
      class="global-search__input"
      :value="search.query"
      placeholder="Search notes…"
      autocomplete="off"
      spellcheck="false"
      @input="onInput"
      @keydown="onKeydown"
      @focus="onFocus"
      @blur="onBlur"
    />
    <kbd v-if="showHint()" class="global-search__hint">{{ shortcut }}</kbd>
    <SearchDropdown
      v-if="search.open && search.results.length > 0"
      :results="search.results"
      :active-index="search.activeIndex"
      :left="left"
      :top="top"
      :width="width"
      @pick="search.openResult($event)"
      @hover="search.setActiveIndex($event)"
      @open-all="search.openResultsTab()"
    />
  </div>
</template>

<style scoped>
.global-search {
  position: relative;
  display: flex;
  align-items: center;
}
.global-search__input {
  width: 100%;
  max-width: 560px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text, rgba(255, 255, 255, 0.85));
  font-size: 12px;
  outline: none;
}
.global-search__input::placeholder {
  color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
}
.global-search__input:focus {
  border-color: var(--color-border, rgba(255, 255, 255, 0.12));
  background: var(--color-surface-solid, rgba(24, 24, 24, 0.6));
}
.global-search__hint {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
  color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
  font-size: 10px;
  line-height: 1.4;
  pointer-events: none;
  user-select: none;
}
</style>