<script setup lang="ts">
/**
 * Per-tab ToC/Minimap right sidebar (Phase 5.2).
 *
 * Mounted as a right-hand sibling of the `Editor` inside `EditorPane.vue`
 * (only for note tabs whose `tocVisible` flag is set). The header carries a
 * two-segment toggle (ToC | Minimap) bound to the tab's `tocMode`; the body
 * switches between the heading outline (`TocList`) and the VS-Code-style
 * minimap (`NoteMinimap`). One action — `layout.toggleToc(tabId)` — opens/closes
 * the panel; the mode choice lives here in the header.
 *
 * The heading outline is per-pane via `useNoteToc` (this tab's note id), so two
 * sidebars in two split panes show two different notes. The minimap reaches the
 * pane's editor DOM via the editor surface registry keyed by `tabId`.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Icon } from "@notesnook-vue/ui-vue";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useNoteToc } from "@/composables/use-note-toc";
import RightSidebar from "./RightSidebar.vue";
import TocList from "./TocList.vue";
import NoteMinimap from "./NoteMinimap.vue";

const props = defineProps<{ tabId: string }>();
const { t } = useI18n();
const layout = useEditorLayoutStore();

const tab = computed(() => layout.tabs[props.tabId] ?? null);
const noteId = computed<string | null>(() => tab.value?.noteId ?? null);
const mode = computed<"toc" | "minimap">(() => tab.value?.tocMode ?? "toc");

const { items, goto } = useNoteToc(noteId, () => props.tabId);

function close(): void {
  layout.toggleToc(props.tabId);
}
function setMode(next: "toc" | "minimap"): void {
  layout.setTocMode(props.tabId, next);
}
</script>

<template>
  <RightSidebar @close="close">
    <template #title>{{ t("toc.title") }}</template>
    <template #actions>
      <div class="flex items-center rounded-md border border-glass-border bg-glass-bg p-0.5">
        <button
          type="button"
          class="grid h-5 w-6 place-items-center rounded text-text-muted hover:text-text"
          :class="{ 'bg-glass-active text-text': mode === 'toc' }"
          :title="t('toc.headings')"
          @click="setMode('toc')"
        >
          <Icon name="list" :size="13" />
        </button>
        <button
          type="button"
          class="grid h-5 w-6 place-items-center rounded text-text-muted hover:text-text"
          :class="{ 'bg-glass-active text-text': mode === 'minimap' }"
          :title="t('toc.minimap')"
          @click="setMode('minimap')"
        >
          <Icon name="map" :size="13" />
        </button>
      </div>
    </template>

    <TocList v-if="mode === 'toc'" :items="items" @goto="goto" />
    <NoteMinimap v-else :tab-key="props.tabId" class="flex min-h-0 flex-1 flex-col" />
  </RightSidebar>
</template>