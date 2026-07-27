<!--
  Omnibar input — lives in the title-bar center slot. The headless
  `useOmnibarStore` owns all state (mode/query/open/activeIndex + the per-mode
  lists); this binds the input to it and hosts the `OmnibarDropdown` (teleported,
  anchored under the field). One input, prefix modes:
    (no prefix) notes   `>` commands   `#` tags   `@` notebooks   `:` tabs/recent

  Keyboard nav: ↑/↓ move, Enter dispatches the active row (or, in notes mode with
  no selection, opens a Search Results tab), Esc closes. A platform-aware shortcut
  hint (⌘K on macOS, Ctrl+K elsewhere) sits INSIDE the field on the right while it
  is empty; the global hotkeys are registered in `TitleBar.vue`
  (⌘⌥F notes / ⌘K commands / ⌘⇧P commands) — they call the store openers, which
  bump `focusSignal`, watched below.
-->
<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Icon } from "@notesnook-vue/ui-vue";
import { useOmnibarStore } from "@/stores/omnibar";
import { useTitleBarStore } from "@/stores/titlebar";
import OmnibarDropdown from "./OmnibarDropdown.vue";

const omnibar = useOmnibarStore();
const titlebar = useTitleBarStore();
const { t } = useI18n();

const input = ref<HTMLInputElement | null>(null);
const field = ref<HTMLElement | null>(null);
// Dropdown anchor (the field's bounding rect), measured when the dropdown opens
// — anchored to the visible pill, not the bare input, so the dropdown matches the
// field's width/position.
const left = ref(0);
const top = ref(0);
const width = ref(0);

const shortcut = titlebar.isMacos ? "⌘K" : "Ctrl+K";
// Show the shortcut hint whenever the field is empty (focused or not) — once you
// start typing it disappears so it never overlaps the query text.
const showHint = () => !omnibar.query;

function measure(): void {
  const r = field.value?.getBoundingClientRect();
  if (!r) return;
  left.value = r.left;
  top.value = r.bottom + 4;
  width.value = r.width;
}

function onInput(e: Event): void {
  omnibar.setQuery((e.target as HTMLInputElement).value);
}

function onKeydown(e: KeyboardEvent): void {
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      omnibar.next();
      break;
    case "ArrowUp":
      e.preventDefault();
      omnibar.prev();
      break;
    case "Enter":
      e.preventDefault();
      omnibar.commitEnter();
      break;
    case "Escape":
      e.preventDefault();
      omnibar.close();
      input.value?.blur();
      break;
  }
}

function onFocus(): void {
  // Reopen the dropdown if there's a query (notes mode: cached results; other
  // modes: the filtered list). Plain click-focus on the omnibar field.
  if (omnibar.query.trim()) omnibar.open = true;
}
function onBlur(): void {
  // Notes mode keeps query + cached results so a refocus reopens them; the other
  // modes are ephemeral pickers — drop the query on blur.
  if (omnibar.mode === "notes") omnibar.close();
  else omnibar.clear();
}

// Hotkeys / the `app:search-notes` command bump `focusSignal` (after setting the
// mode + opening) → focus the input. A non-empty query reopens the dropdown.
watch(
  () => omnibar.focusSignal,
  () => {
    input.value?.focus();
    if (omnibar.query.trim()) omnibar.open = true;
  }
);

// Measure the anchor each time the dropdown opens so it tracks the input
// (window resize / sidebar collapse shift the input's position).
watch(
  () => omnibar.open,
  (isOpen) => {
    if (isOpen) measure();
  }
);
</script>

<template>
  <div class="global-search flex-1">
    <div ref="field" class="global-search__field titlebar-no-drag">
      <Icon name="search" :size="14" class="global-search__icon" />
      <input
        ref="input"
        type="text"
        class="global-search__input"
        :value="omnibar.query"
        :placeholder="t('omnibar.placeholder')"
        autocomplete="off"
        spellcheck="false"
        @input="onInput"
        @keydown="onKeydown"
        @focus="onFocus"
        @blur="onBlur"
      />
      <kbd v-if="showHint()" class="global-search__hint">{{ shortcut }}</kbd>
      <!-- Command-palette opener (moved from the editor toolbar). Sits INSIDE
           the pill, beside the ⌘K hint. -->
      <button
        type="button"
        class="global-search__cmd"
        :title="t('omnibar.commandPaletteTitle')"
        @click="omnibar.openCommands()"
      >
        <Icon name="ellipsis" :size="14" />
      </button>
    </div>
    <OmnibarDropdown
      v-if="omnibar.open && (omnibar.items.length > 0 || omnibar.mode !== 'notes')"
      :items="omnibar.items"
      :active-index="omnibar.activeIndex"
      :left="left"
      :top="top"
      :width="width"
      :mode="omnibar.mode"
      @pick="omnibar.pick($event)"
      @hover="omnibar.setActiveIndex($event)"
      @open-all="omnibar.openResultsTab()"
    />
  </div>
</template>

<style scoped>
.global-search {
  position: relative;
  display: flex;
  align-items: center;
  /* Center the (max-560px) field within the title-bar's flex-1 center slot. */
  justify-content: center;
}
/* The visible search pill — a recessed field with a leading search icon, the
 * shortcut hint, and the command-palette ⋯ button on the right INSIDE it.
 * Distinct from the bare-titlebar look so it reads as a control even when
 * unfocused; brightens on hover/focus. */
.global-search__field {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  max-width: 560px;
  height: 26px;
  padding: 0 8px;
  border-radius: 6px;
  /* Paragraph-derived tint (dark in light theme / light in dark theme) so the
     omnibar outline is visible on both acrylics. Reverses the old
     `var(--color-border)` which read as white-in-light / dark-in-dark. */
  border: 1px solid color-mix(in oklab, var(--paragraph) 14%, transparent);
  background: var(--color-surface-field, rgba(255, 255, 255, 0.05));
  transition: border-color 0.12s ease, background 0.12s ease;
}
.global-search__field:hover {
  background: var(--color-surface-field-hover, rgba(255, 255, 255, 0.08));
}
.global-search__field:focus-within {
  border-color: color-mix(in oklab, var(--paragraph) 30%, transparent);
  background: var(--color-surface-field-focus, rgba(255, 255, 255, 0.1));
}
.global-search__icon {
  flex: 0 0 auto;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.45));
}
.global-search__input {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--color-text, rgba(255, 255, 255, 0.85));
  font-size: 12px;
  outline: none;
}
.global-search__input::placeholder {
  color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
}
/* Shortcut hint — lives inside the field on the right. */
.global-search__hint {
  flex: 0 0 auto;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid color-mix(in oklab, var(--paragraph) 14%, transparent);
  color: var(--color-text-muted);
  background: color-mix(in srgb, var(--paragraph) 4%, transparent);
  font-size: 10px;
  line-height: 1.4;
  pointer-events: none;
  user-select: none;
}
/* Command-palette ⋯ opener — inside the pill, beside the shortcut hint. */
.global-search__cmd {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.45));
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.global-search__cmd:hover {
  background: color-mix(in srgb, var(--paragraph) 10%, transparent);
  color: var(--color-text);
}
</style>