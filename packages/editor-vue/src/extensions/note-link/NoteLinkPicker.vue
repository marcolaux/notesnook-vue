<!--
  Note-link picker (note-linking). Rendered two ways:

   1. INLINE — by `render.ts` via TipTap's `VueRenderer` while the `@`/`[[`
      Suggestion plugin is active. The note-list query is the text typed after
      the trigger in the editor; `items` is driven externally (synced by
      `render.ts` as the query changes). No search field.
   2. TOOLBAR — mounted by the host's toolbar button below the button rect.
      The component owns its query + calls `search(query)` on input.

  Both variants drill into a note's content blocks (upstream `?blockId=`):
  selecting a note calls `getBlocks(note.id)`; if blocks are returned the picker
  switches to a block list (with a "Link to whole note" top row + a back
  button), else it links the whole note directly.

  `render.ts` owns keyboard routing for the inline variant and calls the
  exposed `next`/`prev`/`selectActive`. The toolbar variant handles its own
  keyboard via the search input's `@keydown`.

  Scoped CSS (no Tailwind) matches `TagMenu.vue` so editor-vue stays a lower
  layer than ui-vue.
-->
<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { cycleIndex } from "../../utils/filter";
import { createInternalLink } from "../link/internal-link";
import type {
  NoteSuggestionItem,
  ContentBlockItem,
  NoteLinkResult,
  NoteLinkLabels
} from "./types";
import { DEFAULT_NOTE_LINK_LABELS } from "./types";

const props = withDefaults(
  defineProps<{
    /** "inline" = driven by the Suggestion plugin (items synced externally);
     *  "toolbar" = owns its query + calls `search`. */
    variant?: "inline" | "toolbar";
    /** Note results (inline variant). Ignored in toolbar variant. */
    items?: NoteSuggestionItem[];
    /** Invoked with the final `{href, title}` once a note/block is chosen. */
    command: (result: NoteLinkResult) => void;
    /** Live cursor rect from the suggestion plugin (inline variant). */
    clientRect?: (() => DOMRect | null) | null;
    /** Note search (toolbar variant). When omitted in toolbar mode, the
     *  popup lists `items` (if provided) or shows no-results. */
    search?: (query: string) => NoteSuggestionItem[];
    /** Block drilldown (both variants). Returns a note's content blocks. */
    getBlocks?: (noteId: string) => Promise<ContentBlockItem[]>;
    labels?: Partial<NoteLinkLabels>;
    /** Initial query for the toolbar variant's search field. */
    initialQuery?: string;
  }>(),
  { variant: "inline", items: () => [], initialQuery: "" }
);

/** Toolbar variant: emitted on outside-click / Escape so the host closes the
 *  popup. (The inline variant is closed by the Suggestion plugin's `onExit`,
 *  so it never emits `close`.) */
const emit = defineEmits<{ close: [] }>();

const L = computed<NoteLinkLabels>(() => ({
  ...DEFAULT_NOTE_LINK_LABELS,
  ...props.labels
}));

const el = ref<HTMLElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const mode = ref<"notes" | "blocks">("notes");
const query = ref(props.initialQuery);
const toolbarItems = ref<NoteSuggestionItem[]>([]);
const blocks = ref<ContentBlockItem[]>([]);
const selectedNote = ref<NoteSuggestionItem | null>(null);
const activeIndex = ref(0);
const loadingBlocks = ref(false);

/** The note rows currently shown (inline: external items; toolbar: own search). */
const noteItems = computed<NoteSuggestionItem[]>(() =>
  props.variant === "toolbar" ? toolbarItems.value : props.items ?? []
);

interface Row {
  kind: "whole" | "block";
  block?: ContentBlockItem;
}

/** Block-mode rows: a leading "Link to whole note" row + one row per block. */
const blockRows = computed<Row[]>(() => [
  { kind: "whole" },
  ...blocks.value.map((b) => ({ kind: "block", block: b }) as Row)
]);

const rows = computed<(NoteSuggestionItem | Row)[]>(() =>
  mode.value === "notes" ? noteItems.value : blockRows.value
);

const rowCount = computed(() => (mode.value === "notes" ? noteItems.value.length : blockRows.value.length));

function clampActive(): void {
  if (rowCount.value === 0) activeIndex.value = 0;
  else if (activeIndex.value >= rowCount.value) activeIndex.value = rowCount.value - 1;
}

function reposition(): void {
  if (!el.value) return;
  const rect = props.clientRect?.() ?? null;
  if (!rect) return;
  const menuW = el.value.offsetWidth || 280;
  const menuH = el.value.offsetHeight || 240;
  const top = Math.min(rect.bottom + 4, window.innerHeight - menuH - 8);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuW - 8));
  el.value.style.top = `${Math.max(8, top)}px`;
  el.value.style.left = `${left}px`;
}

function emitWhole(): void {
  const n = selectedNote.value;
  if (!n) return;
  props.command({ href: createInternalLink("note", n.id), title: n.title });
}

function emitBlock(b: ContentBlockItem): void {
  const n = selectedNote.value;
  if (!n) return;
  props.command({
    href: createInternalLink("note", n.id, { blockId: b.id }),
    title: b.content.trim() || n.title
  });
}

async function selectNote(note: NoteSuggestionItem): Promise<void> {
  if (props.getBlocks) {
    loadingBlocks.value = true;
    try {
      const result = await props.getBlocks(note.id);
      if (result.length > 0) {
        selectedNote.value = note;
        blocks.value = result;
        mode.value = "blocks";
        activeIndex.value = 0;
        await nextTick(reposition);
        return;
      }
    } finally {
      loadingBlocks.value = false;
    }
  }
  // No blocks / no getBlocks → link the whole note directly.
  selectedNote.value = note;
  props.command({ href: createInternalLink("note", note.id), title: note.title });
}

function backToNotes(): void {
  mode.value = "notes";
  blocks.value = [];
  selectedNote.value = null;
  activeIndex.value = 0;
  nextTick(() => {
    if (props.variant === "toolbar") searchInput.value?.focus();
    else nextTick(reposition);
  });
}

function selectRow(i: number): void {
  if (mode.value === "notes") {
    const note = noteItems.value[i];
    if (note) void selectNote(note);
    return;
  }
  const row = blockRows.value[i];
  if (!row) return;
  if (row.kind === "whole") emitWhole();
  else if (row.block) emitBlock(row.block);
}

function next(): void {
  activeIndex.value = cycleIndex(activeIndex.value, rowCount.value, 1);
}
function prev(): void {
  activeIndex.value = cycleIndex(activeIndex.value, rowCount.value, -1);
}
function selectActive(): void {
  selectRow(activeIndex.value);
}
defineExpose({ next, prev, selectActive });

// --- Toolbar variant: own query → search -----------------------------------
function runSearch(): void {
  if (props.variant !== "toolbar" || !props.search) return;
  toolbarItems.value = props.search(query.value) ?? [];
  activeIndex.value = 0;
  void nextTick(reposition);
}

function onSearchKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    next();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    prev();
  } else if (event.key === "Enter") {
    event.preventDefault();
    selectActive();
  }
}

watch(
  () => noteItems.value,
  () => {
    // Typing while in blocks mode (inline trigger) means the user resumed
    // searching notes — drop the block drilldown and go back to note results.
    if (mode.value !== "notes") {
      mode.value = "notes";
      blocks.value = [];
      selectedNote.value = null;
    }
    activeIndex.value = 0;
    void nextTick(reposition);
  }
);

function onScroll(): void {
  reposition();
}

// --- Toolbar variant: close on outside-click / Escape ---------------------
function onOutsideMousedown(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  // Ignore clicks on the toolbar trigger button itself — it toggles the popup
  // via its own `@click`, so an outside-click here would close-then-reopen.
  if (target.closest("[data-note-link-trigger]")) return;
  if (el.value && !el.value.contains(target)) emit("close");
}
function onGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") emit("close");
}

onMounted(() => {
  clampActive();
  if (props.variant === "toolbar") {
    runSearch();
    nextTick(() => searchInput.value?.focus());
    window.addEventListener("mousedown", onOutsideMousedown, true);
    window.addEventListener("keydown", onGlobalKeydown, true);
  } else {
    void nextTick(reposition);
  }
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onScroll);
});
onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll, true);
  window.removeEventListener("resize", onScroll);
  if (props.variant === "toolbar") {
    window.removeEventListener("mousedown", onOutsideMousedown, true);
    window.removeEventListener("keydown", onGlobalKeydown, true);
  }
});

function ellipsize(s: string, n = 80): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}
</script>

<template>
  <Teleport to="body">
    <div
      ref="el"
      class="nl-menu"
      contenteditable="false"
      @mousedown.prevent
    >
      <div v-if="variant === 'toolbar' && mode === 'notes'" class="nl-search">
        <input
          ref="searchInput"
          v-model="query"
          class="nl-search__input"
          :placeholder="L.searchPlaceholder"
          @keydown="onSearchKeydown"
          @input="runSearch"
        />
      </div>

      <div v-if="mode === 'blocks'" class="nl-back">
        <button type="button" class="nl-back__btn" @click="backToNotes">‹ {{ L.backToNotes }}</button>
      </div>

      <div v-if="mode === 'notes'">
        <div v-if="noteItems.length === 0" class="nl-empty">{{ L.noResults }}</div>
        <button
          v-for="(item, i) in noteItems"
          :key="item.id"
          class="nl-item"
          :class="{ 'nl-item--active': i === activeIndex }"
          type="button"
          @click="selectNote(item)"
          @mouseenter="activeIndex = i"
        >
          <span class="nl-item__title">{{ item.title }}</span>
          <span v-if="item.snippetHtml" class="nl-item__snippet" v-html="item.snippetHtml" />
        </button>
      </div>

      <div v-else>
        <button
          v-for="(row, i) in blockRows"
          :key="row.kind === 'whole' ? 'whole' : row.block!.id"
          class="nl-item nl-item--block"
          :class="{ 'nl-item--active': i === activeIndex }"
          type="button"
          @click="selectRow(i)"
          @mouseenter="activeIndex = i"
        >
          <span v-if="row.kind === 'whole'" class="nl-item__title nl-item__whole">{{ L.linkWholeNote }}</span>
          <template v-else>
            <span class="nl-item__blocktext">{{ ellipsize(row.block!.content) || L.emptyBlock }}</span>
            <span class="nl-item__badge">{{ row.block!.type }}</span>
          </template>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.nl-menu {
  position: fixed;
  z-index: 50;
  width: 280px;
  max-height: 320px;
  overflow-y: auto;
  padding: 4px;
  border-radius: 10px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  background: var(--color-surface-solid, rgba(24, 24, 24, 0.92));
  backdrop-filter: blur(var(--backdrop-blur-base, 24px));
  box-shadow: 0 8px 24px color-mix(in srgb, black 35%, transparent);
  font-size: 13px;
}

.nl-search {
  padding: 4px 4px 6px;
}
.nl-search__input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
  background: transparent;
  color: var(--color-text, rgba(255, 255, 255, 0.85));
  font: inherit;
  outline: none;
}
.nl-search__input:focus {
  border-color: var(--color-hover, rgba(255, 255, 255, 0.25));
}

.nl-back {
  padding: 2px 2px 4px;
}
.nl-back__btn {
  border: none;
  background: transparent;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
  font: inherit;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
}
.nl-back__btn:hover {
  background: var(--color-hover, rgba(255, 255, 255, 0.08));
  color: var(--color-text, rgba(255, 255, 255, 0.85));
}

.nl-empty {
  padding: 10px 12px;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
}

.nl-item {
  display: flex;
  width: 100%;
  flex-direction: column;
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
.nl-item--active {
  background: var(--color-hover, rgba(255, 255, 255, 0.08));
  color: var(--color-heading, #fff);
}
.nl-item__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nl-item__snippet {
  font-size: 11px;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nl-item__snippet :deep(mark) {
  background: transparent;
  color: inherit;
  font-weight: 600;
}

.nl-item--block {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.nl-item__blocktext {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
}
.nl-item__whole {
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
  font-style: italic;
}
.nl-item__badge {
  flex-shrink: 0;
  font-size: 10px;
  text-transform: uppercase;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
  background: var(--color-hover, rgba(255, 255, 255, 0.08));
  padding: 2px 6px;
  border-radius: 4px;
}
</style>