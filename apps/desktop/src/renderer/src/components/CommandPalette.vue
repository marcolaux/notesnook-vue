<!--
  Command-palette overlay (Phase 2.5 follow-up). The headless core lives in
  `stores/command-palette` (open/query/activeIndex/items + filter/execute) and
  the global `Ctrl/Cmd+Shift+P` hotkey in `composables/use-command-palette`; this
  component is purely the visual surface — a VS-Code-style centered palette
  teleported to <body> so it floats above the shell and the login screen alike.

  State is owned by the store; this binds to it:
    input  → setQuery
    ↑/↓    → next / prev
    Enter  → execute
    Esc    → closePalette (also handled by the global hotkey; idempotent)
    hover  → setActiveIndex
    click  → setActiveIndex + execute
  The active row scrolls into view as the index changes.
-->
<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { useCommandPaletteStore } from "@/stores/command-palette";

const palette = useCommandPaletteStore();

const root = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);

function onInput(e: Event): void {
  palette.setQuery((e.target as HTMLInputElement).value);
}

function onKeydown(e: KeyboardEvent): void {
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      palette.next();
      break;
    case "ArrowUp":
      e.preventDefault();
      palette.prev();
      break;
    case "Enter":
      e.preventDefault();
      palette.execute();
      break;
    case "Escape":
      e.preventDefault();
      palette.closePalette();
      break;
  }
}

function setActive(i: number): void {
  palette.setActiveIndex(i);
}

function run(i: number): void {
  palette.setActiveIndex(i);
  palette.execute();
}

// Focus the input each time the palette opens (the component stays mounted in
// App.vue; the v-if below only toggles the overlay DOM). `flush: "post"` runs
// after the DOM update so the input ref is populated — no nested nextTick.
watch(
  () => palette.open,
  (isOpen) => {
    if (isOpen) input.value?.focus();
  },
  { immediate: true, flush: "post" }
);

// Keep the active row visible within the scrollable list.
watch(
  () => palette.activeIndex,
  () => {
    root.value?.querySelector(".command-palette__item.is-active")?.scrollIntoView({ block: "nearest" });
  },
  { flush: "post" }
);

// Defensive: close if the component unmounts while open (e.g. app teardown).
onBeforeUnmount(() => {
  if (palette.open) palette.closePalette();
});
</script>

<template>
  <Teleport to="body">
    <div v-if="palette.open" ref="root" class="command-palette" @keydown="onKeydown" @mousedown.prevent>
      <input
        ref="input"
        class="command-palette__input"
        type="text"
        :value="palette.query"
        placeholder="Type a command…"
        autocomplete="off"
        spellcheck="false"
        @input="onInput"
      />
      <div class="command-palette__list">
        <button
          v-for="(cmd, i) in palette.items"
          :key="cmd.id"
          type="button"
          class="command-palette__item"
          :class="{ 'is-active': i === palette.activeIndex }"
          @mouseenter="setActive(i)"
          @click="run(i)"
        >
          <span class="command-palette__title">{{ cmd.title }}</span>
          <span class="command-palette__group">{{ cmd.group }}</span>
        </button>
        <div v-if="palette.items.length === 0" class="command-palette__empty">No matching commands</div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.command-palette {
  position: fixed;
  top: 14vh;
  left: 50%;
  z-index: 60;
  width: min(520px, 92vw);
  transform: translateX(-50%);
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  background: var(--color-surface-solid, rgba(24, 24, 24, 0.92));
  backdrop-filter: blur(var(--backdrop-blur-base, 24px));
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  font-size: 13px;
}

.command-palette__input {
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  background: transparent;
  color: var(--color-heading, #fff);
  font: inherit;
  outline: none;
}
.command-palette__input::placeholder {
  color: var(--color-placeholder, rgba(255, 255, 255, 0.35));
}

.command-palette__list {
  overflow-y: auto;
  padding: 4px;
}

.command-palette__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
.command-palette__item.is-active {
  background: var(--color-hover, rgba(255, 255, 255, 0.08));
  color: var(--color-heading, #fff);
}

.command-palette__group {
  flex: none;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.45));
}

.command-palette__empty {
  padding: 12px 10px;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.45));
}
</style>