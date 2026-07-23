<script setup lang="ts">
/**
 * Heading-outline list — the "ToC" mode of the per-tab right sidebar.
 *
 * Renders the note's headings (from `useNoteToc`) indented by level; clicking
 * one scrolls the pane's editor to that heading via the editor surface
 * registry. Empty state when the note has no headings.
 */
import { useI18n } from "vue-i18n";
import type { TocItem } from "@/utils/toc";

defineProps<{ items: TocItem[] }>();
const emit = defineEmits<{ goto: [id: string, text: string] }>();
const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <div v-if="items.length === 0" class="px-1 py-2 text-xs text-text-muted">
      {{ t("toc.empty") }}
    </div>
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="truncate rounded px-2 py-1 text-left text-xs text-text-muted transition-colors hover:bg-glass-hover hover:text-text"
      :style="{ paddingLeft: `${0.5 + (item.level - 1) * 0.75}rem` }"
      :title="item.text"
      @click="emit('goto', item.id, item.text)"
    >
      {{ item.text }}
    </button>
  </div>
</template>