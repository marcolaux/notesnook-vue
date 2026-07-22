<!--
  Search Results tab — the structured full-results surface for a global search.
  Rendered by `EditorPane.vue` for `kind: "search"` tabs (outside `<KeepAlive>`:
  it re-reads from the search store's `resultsCache`, cheap, and caching would
  pin a stale result set). Reads the tab's `searchQuery` from the layout store
  and the cached result list for it; re-fetches via `search.loadResults` if the
  cache entry was evicted (rare — the tab is usually opened right after a search).

  Each result is a card: the (highlighted) note title + its body snippet blocks.
  Clicking a snippet block opens the note in a new tab scrolled to that match
  (`search.openNoteAt`). Snippets render via `v-html` of `matchesToHtml`
  (escaped + `<mark>`-wrapped) — safe by construction (see `@contracts/search`).
-->
<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useSearchStore } from "@/stores/search";
import { matchesToHtml, type HighlightedResult } from "@contracts/search";

const props = defineProps<{ tabId: string }>();

const layout = useEditorLayoutStore();
const search = useSearchStore();

const query = computed(() => layout.tabs[props.tabId]?.searchQuery ?? "");
const items = ref<HighlightedResult[]>([]);
const loading = ref(false);

onMounted(async () => {
  const q = query.value;
  if (!q) return;
  const cached = search.resultsCache[q];
  if (cached) {
    items.value = cached;
    return;
  }
  loading.value = true;
  items.value = await search.loadResults(q);
  loading.value = false;
});

function open(noteId: string, matchIndex: number): void {
  search.openNoteAt(noteId, query.value, matchIndex);
}
</script>

<template>
  <div class="search-results flex h-full flex-col">
    <header class="search-results__header">
      <span class="search-results__query">Search: <strong>{{ query }}</strong></span>
      <span class="search-results__count">{{ items.length }} result{{ items.length === 1 ? "" : "s" }}</span>
    </header>
    <div class="search-results__list">
      <div v-if="loading" class="search-results__empty">Searching…</div>
      <div v-else-if="items.length === 0" class="search-results__empty">
        No results for “{{ query }}”
      </div>
      <div v-for="(r, i) in items" :key="r.id" class="search-results__card">
        <button
          type="button"
          class="search-results__title"
          :title="`Open ${r.id}`"
          @click="open(r.id, 0)"
          v-html="r.title.length ? matchesToHtml(r.title) : 'Untitled'"
        />
        <ul v-if="r.content.length > 0" class="search-results__snippets">
          <li v-for="(block, b) in r.content" :key="b">
            <button type="button" class="search-results__snippet" @click="open(r.id, b)" v-html="matchesToHtml(block)" />
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-results {
  background: var(--color-surface-solid, rgba(24, 24, 24, 0.92));
  color: var(--color-text, rgba(255, 255, 255, 0.85));
  font-size: 13px;
}
.search-results__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
}
.search-results__query {
  color: var(--color-text-muted, rgba(255, 255, 255, 0.55));
}
.search-results__count {
  font-size: 11px;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.45));
}
.search-results__list {
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.search-results__empty {
  padding: 24px 16px;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.45));
}
.search-results__card {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
  background: var(--color-surface-solid, rgba(30, 30, 30, 0.6));
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.search-results__title {
  text-align: left;
  border: none;
  background: transparent;
  color: var(--color-heading, #fff);
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.search-results__title:hover {
  text-decoration: underline;
}
.search-results__snippets {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.search-results__snippet {
  text-align: left;
  border: none;
  background: transparent;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  font: inherit;
  line-height: 1.4;
}
.search-results__snippet:hover {
  background: var(--color-hover, rgba(255, 255, 255, 0.06));
  color: var(--color-text, rgba(255, 255, 255, 0.85));
}
:deep(.find-match) {
  background: rgba(250, 204, 21, 0.35);
  border-radius: 2px;
  color: inherit;
}
</style>