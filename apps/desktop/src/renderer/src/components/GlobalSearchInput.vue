<!--
  Omnibar input — lives in the title-bar center slot. The headless
  `useOmnibarStore` owns all state (mode/query/open/activeIndex + the per-mode
  lists); this binds the input to it and hosts the `OmnibarDropdown` (teleported,
  anchored under the field). One input, prefix modes:
    (no prefix) notes   `>` commands   `#` tags   `@` notebooks   `:` tabs/recent

  Keyboard nav: ↑/↓ move, Enter dispatches the active row (or, in notes mode with
  no selection, opens a Search Results tab), Esc closes. A platform-aware shortcut
  hint (⌘⌥F search / ⌘K commands on macOS, Ctrl+Alt+F / Ctrl+K elsewhere) sits
  INSIDE the field on the right while it is empty; the global hotkeys are
  registered in `TitleBar.vue`
  (⌘⌥F notes / ⌘K commands / ⌘⇧P commands) — they call the store openers, which
  bump `focusSignal`, watched below.
-->
<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import type { Editor } from "@tiptap/vue-3";
import { Icon } from "@notesnook-vue/ui-vue";
import { useOmnibarStore } from "@/stores/omnibar";
import { useTitleBarStore } from "@/stores/titlebar";
import { useEditorStore } from "@/stores/editor";
import { useNavHistoryStore } from "@/stores/nav-history";
import OmnibarDropdown from "./OmnibarDropdown.vue";

const omnibar = useOmnibarStore();
const titlebar = useTitleBarStore();
const { t } = useI18n();
const editorStore = useEditorStore();
const nav = useNavHistoryStore();

const input = ref<HTMLInputElement | null>(null);
const field = ref<HTMLElement | null>(null);
// Dropdown anchor (the field's bounding rect), measured when the dropdown opens
// — anchored to the visible pill, not the bare input, so the dropdown matches the
// field's width/position.
const left = ref(0);
const top = ref(0);
const width = ref(0);

// Two global hotkeys open this field (registered in `TitleBar.vue`): the search
// binding (⌘⌥F / Ctrl+Alt+F → notes mode, the field's default) and the command
// binding (⌘K / Ctrl+K → command mode, same as the ⋯ button). Both are hinted
// inside the field on the right so the bindings are discoverable.
const searchShortcut = titlebar.isMacos ? "⌘⌥F" : "Ctrl+Alt+F";
const commandShortcut = titlebar.isMacos ? "⌘K" : "Ctrl+K";
// Show the shortcut hints whenever the field is empty (focused or not) — once
// you start typing they disappear so they never overlap the query text.
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

// The editor (if any) that held DOM focus right before the omnibar stole it —
// captured at open time so Escape can put the caret back where it was. `undefined`
// when the omnibar was opened from a non-editor surface (notes list, ⋯ button
// clicked while the list had focus, an attachment tab, …), in which case Escape
// leaves focus where it lands (today's behavior). Cleared again whenever the
// omnibar closes so a stale capture never survives into the next session.
let lastEditor: Editor | undefined;

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
    case "Escape": {
      e.preventDefault();
      // Capture before close/blur — closing schedules the open watcher (below)
      // which clears `lastEditor`, and blur fires `onBlur` which calls close/clear
      // again, but neither clears the local synchronously.
      const ed = lastEditor;
      omnibar.close();
      input.value?.blur();
      if (ed) void nextTick(() => ed.commands.focus());
      break;
    }
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
    // A fresh open (input not yet focused) is the moment to record whether the
    // editor held DOM focus — `openIn` set `open=true` then bumped this signal,
    // but the input hasn't received focus yet, so `document.activeElement` is
    // still the editor's ProseMirror. A re-focus bump while the omnibar already
    // has focus leaves the original capture untouched. `useEditorStore().editor`
    // resolves the focused pane's live editor (the omnibar never changes the
    // focused pane key) — guard it with the ProseMirror check so opening from a
    // non-editor surface (notes list, attachment tab) does NOT capture.
    const alreadyFocused = document.activeElement === input.value;
    if (!alreadyFocused) {
      const active = document.activeElement;
      const ed = editorStore.editor;
      lastEditor =
        ed && active && active.closest(".ProseMirror") ? ed : undefined;
    }
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
    else lastEditor = undefined;
  }
);
</script>

<template>
  <div class="global-search flex-1">
    <!-- Global back/forward navigation (the per-window nav-history stack).
         Sits INSIDE the omnibar's centered row so the pair hugs the pill's left
         side (the whole [back][fwd][pill] group is centered together). -->
    <button
      type="button"
      class="global-search__nav titlebar-no-drag"
      :title="t('titlebar.navBack')"
      :disabled="!nav.canBack"
      @click="nav.back()"
    >
      <Icon name="arrow-left" :size="16" />
    </button>
    <button
      type="button"
      class="global-search__nav titlebar-no-drag"
      :title="t('titlebar.navForward')"
      :disabled="!nav.canForward"
      @click="nav.forward()"
    >
      <Icon name="arrow-right" :size="16" />
    </button>
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
      <div v-if="showHint()" class="global-search__hints">
        <kbd class="global-search__hint">{{ searchShortcut }}</kbd>
        <kbd class="global-search__hint">{{ commandShortcut }}</kbd>
      </div>
      <!-- Command-palette opener (moved from the editor toolbar). Sits INSIDE
           the pill, beside the shortcut hints. -->
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
      :cluster-loading="omnibar.clusterLoading"
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
  /* Center the [back][fwd][field] group within the title-bar's flex-1 slot so
     the nav buttons hug the pill's left side. */
  justify-content: center;
  gap: 4px;
}
/* Global back/forward nav buttons — sit immediately left of the pill. Styled
 * to match the titlebar toggle buttons (muted, hover surface, disabled dim). */
.global-search__nav {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  border-radius: 6px;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.45));
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.12s ease, opacity 0.12s ease;
}
.global-search__nav:hover:not(:disabled) {
  background: var(--color-surface-field-hover, rgba(255, 255, 255, 0.08));
}
.global-search__nav:disabled {
  cursor: default;
  opacity: 0.4;
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
/* Shortcut hints — live inside the field on the right. The search binding
 * (⌘⌥F) and command binding (⌘K) sit together so both global openers are
 * discoverable. */
.global-search__hints {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 3px;
}
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