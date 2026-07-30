<!--
  Search Results tab — the structured full-results surface for a global search.
  Rendered by `EditorPane.vue` for `kind: "search"` tabs (outside `<KeepAlive>`:
  it re-reads from the omnibar store's `resultsCache`, cheap, and caching would
  pin a stale result set). Reads the tab's `searchQuery` from the layout store
  and the cached TIERED result set for it (Exact → Semantic → Cluster); re-fetches
  via `omnibar.loadResults` if the cache entry was evicted.

  The cache entry is read REACTIVELY (`computed` over `omnibar.resultsCache[q]`)
  so the async Cluster tier — which `loadResults` / the dropdown's live search
  bump into the cache after Exact + Semantic have rendered — fades in here live
  without re-mounting.

  Results are grouped into three labeled, sticky-header sections by tier. Each
  result is a card: the (highlighted) note title + its body snippet blocks.
  Clicking a snippet block opens the note in a new tab scrolled to that match
  (`omnibar.openNoteAt`). Snippets render via `v-html` of `matchesToHtml`
  (escaped + `<mark>`-wrapped) — safe by construction (see `@contracts/search`).
-->
<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useOmnibarStore, type TieredSearchResults } from "@/stores/omnibar";
import { matchesToHtml, type HighlightedResult } from "@contracts/search";

const props = defineProps<{ tabId: string }>();
const { t } = useI18n();

const layout = useEditorLayoutStore();
const omnibar = useOmnibarStore();

const query = computed(() => layout.tabs[props.tabId]?.searchQuery ?? "");
/** Reactive view of the cached tiered results — updates live when the async
 *  cluster tier lands (the store re-bumps the cache). */
const tiered = computed<TieredSearchResults | undefined>(() => omnibar.resultsCache[query.value]);
const loading = ref(false);

/** Cluster tier is pending when the live dropdown is still building it for this
 *  query (the common case: the tab is opened right after a search). Falls back
 *  to "no hint" when the cluster build was kicked non-live (cache-hit refill). */
const clusterPending = computed(
  () =>
    !!tiered.value &&
    tiered.value.cluster.length === 0 &&
    omnibar.clusterLoading &&
    query.value === omnibar.lastQuery
);

/** Ordered, non-empty sections (cluster kept while pending so the hint shows). */
const sections = computed<{ tier: "exact" | "semantic" | "cluster"; label: string; items: HighlightedResult[] }[]>(() => {
  const tr = tiered.value;
  if (!tr) return [];
  const secs = [
    { tier: "exact" as const, label: t("omnibar.tierExact"), items: tr.exact },
    { tier: "semantic" as const, label: t("omnibar.tierSemantic"), items: tr.semantic },
    { tier: "cluster" as const, label: t("omnibar.tierCluster"), items: tr.cluster }
  ];
  return secs.filter((s) => s.items.length > 0 || (s.tier === "cluster" && clusterPending.value));
});

const totalCount = computed(() => {
  const tr = tiered.value;
  if (!tr) return 0;
  return tr.exact.length + tr.semantic.length + tr.cluster.length;
});

onMounted(async () => {
  const q = query.value;
  if (!q) return;
  // Always go through `loadResults`: it returns the cache hit instantly AND
  // backfills the cluster tier if it's still empty (rare refill path).
  if (!omnibar.resultsCache[q]) {
    loading.value = true;
    await omnibar.loadResults(q);
    loading.value = false;
  } else {
    await omnibar.loadResults(q);
  }
});

function open(noteId: string, matchIndex: number): void {
  omnibar.openNoteAt(noteId, query.value, matchIndex);
}
</script>

<template>
  <div class="search-results flex h-full flex-col">
    <header class="search-results__header">
      <span class="search-results__query">Search: <strong>{{ query }}</strong></span>
      <span class="search-results__count">{{ totalCount }} result{{ totalCount === 1 ? "" : "s" }}</span>
    </header>
    <div class="search-results__list">
      <div v-if="loading" class="search-results__empty">Searching…</div>
      <div v-else-if="sections.length === 0" class="search-results__empty">
        No results for “{{ query }}”
      </div>
      <section v-for="sec in sections" :key="sec.tier" class="search-results__section">
        <div class="search-results__section-header">{{ sec.label }}</div>
        <div
          v-if="sec.tier === 'cluster' && sec.items.length === 0 && clusterPending"
          class="search-results__empty"
        >
          {{ t('omnibar.tierClusterLoading') }}
        </div>
        <div v-for="(r, i) in sec.items" :key="r.id" class="search-results__card">
          <button
            type="button"
            class="search-results__title"
            :title="`Open ${r.id}`"
            @click="open(r.id, 0)"
            v-html="r.title.length ? matchesToHtml(r.title) : t('common.untitled')"
          />
          <ul v-if="r.content.length > 0" class="search-results__snippets">
            <li v-for="(block, b) in r.content" :key="b">
              <button type="button" class="search-results__snippet" @click="open(r.id, b)" v-html="matchesToHtml(block)" />
            </li>
          </ul>
        </div>
      </section>
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
.search-results__section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.search-results__section-header {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 4px 4px 2px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.45));
  background: var(--color-surface-solid, rgba(24, 24, 24, 0.92));
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
  background: color-mix(in srgb, var(--accent) 35%, transparent);
  border-radius: 2px;
  color: inherit;
}
</style>