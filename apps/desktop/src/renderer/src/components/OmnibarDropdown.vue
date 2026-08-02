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
import { useI18n } from "vue-i18n";
import type { OmnibarItem, OmnibarMode, SearchTier } from "@/stores/omnibar";
import { isReindexing } from "@/utils/vector-search";

const props = defineProps<{
  items: OmnibarItem[];
  activeIndex: number;
  left: number;
  top: number;
  width: number;
  mode: OmnibarMode;
  /** True while the (async) cluster tier is being computed (notes mode only). */
  clusterLoading?: boolean;
}>();
const emit = defineEmits<{
  pick: [index: number];
  openAll: [];
  hover: [index: number];
}>();

const root = ref<HTMLElement | null>(null);
const { t } = useI18n();

const emptyText = computed(() => {
  switch (props.mode) {
    case "notes":
      return t("omnibar.noResults");
    case "commands":
      return t("omnibar.noMatchingCommands");
    case "tags":
      return t("omnibar.noMatchingTags");
    case "notebooks":
      return t("omnibar.noMatchingNotebooks");
    case "tabs":
      return t("omnibar.noOpenTabs");
  }
});

/** Notes-mode section header for a tier. */
function tierLabel(tier: SearchTier | undefined): string {
  switch (tier) {
    case "exact":
      return t("omnibar.tierExact");
    case "semantic":
      return t("omnibar.tierSemantic");
    case "cluster":
      return t("omnibar.tierCluster");
    default:
      return "";
  }
}

/** Notes-mode rows grouped by tier (they arrive pre-grouped in priority order),
 *  each carrying its flat `start` index so `is-active`/`pick`/`hover` keep
 *  addressing the store's flat `items` coordinate space. Non-notes modes return
 *  `null` and render the legacy flat list. */
interface TierGroup {
  tier: SearchTier;
  label: string;
  items: OmnibarItem[];
  start: number;
}
const groups = computed<TierGroup[] | null>(() => {
  if (props.mode !== "notes") return null;
  const out: TierGroup[] = [];
  for (let i = 0; i < props.items.length; i++) {
    const tier = props.items[i]?.tier ?? "exact";
    let last = out[out.length - 1];
    if (!last || last.tier !== tier) {
      // Start a new tier group; reassign `last` so the item below lands in the
      // NEW group, not the previous one (the old code captured `last` before this
      // push, dropping the first item of every tier — and with a single result,
      // dropping the only item, leaving an empty dropdown under a lone header).
      last = { tier, label: tierLabel(tier), items: [], start: i };
      out.push(last);
    }
    last.items.push(props.items[i]!);
  }
  return out;
});

/** Whether the cluster tier is pending but not yet present (show a loading hint). */
const clusterPending = computed(
  () => props.mode === "notes" && !!props.clusterLoading && (groups.value ?? []).every((g) => g.tier !== "cluster")
);

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
        <!-- Notes mode: tiered sections with sticky headers (Exact → Semantic →
             Cluster). Flat indices are preserved via each group's `start` offset. -->
        <template v-if="groups">
          <template v-for="group in groups" :key="group.tier">
            <div class="omnibar-dropdown__section-header">{{ group.label }}</div>
            <button
              v-for="(item, gi) in group.items"
              :key="item.key"
              type="button"
              class="omnibar-dropdown__item omnibar-dropdown__item--note"
              :class="{ 'is-active': group.start + gi === props.activeIndex }"
              @mouseenter="emit('hover', group.start + gi)"
              @click="emit('pick', group.start + gi)"
            >
              <span class="omnibar-dropdown__title" v-html="item.titleHtml" />
              <span class="omnibar-dropdown__snippet" v-html="item.snippetHtml" />
            </button>
          </template>
          <div v-if="clusterPending" class="omnibar-dropdown__section-hint">
            {{ t('omnibar.tierClusterLoading') }}
          </div>
          <div v-else-if="props.mode === 'notes' && isReindexing" class="omnibar-dropdown__section-hint">
            {{ t('omnibar.reindexing') }}
          </div>
          <div v-if="props.items.length === 0" class="omnibar-dropdown__empty">{{ emptyText }}</div>
        </template>
        <!-- Every other mode: the legacy flat list. -->
        <template v-else>
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
        </template>
      </div>
      <button
        v-if="props.mode === 'notes' && props.items.length > 0"
        type="button"
        class="omnibar-dropdown__footer"
        @click="emit('openAll')"
      >
        {{ t('omnibar.viewAllResults') }} <span class="omnibar-dropdown__kbd">↵</span>
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
  box-shadow: 0 12px 40px color-mix(in srgb, black 45%, transparent);
  font-size: 12px;
}
.omnibar-dropdown__list {
  overflow-y: auto;
  padding: 4px;
}
/* Tier section headers (Exact / Semantic / Cluster) — sticky like NotesList's
   date buckets so they stay visible while their rows scroll past. */
.omnibar-dropdown__section-header {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 6px 10px 3px;
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.45));
  background: var(--color-surface-solid, rgba(24, 24, 24, 0.92));
  backdrop-filter: blur(var(--backdrop-blur-base, 24px));
}
.omnibar-dropdown__section-hint {
  padding: 4px 10px 6px;
  font-size: 10px;
  font-style: italic;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
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
  background: color-mix(in srgb, var(--accent) 35%, transparent);
  border-radius: 2px;
  color: inherit;
}
</style>