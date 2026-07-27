<script setup lang="ts">
/**
 * Placeholder for unbuilt sidebar collections (Notebooks / Tags / Monographs /
 * Archive / Trash). Title + hint come from the matched route's `meta` (see
 * `router/routes.ts`) as i18n key strings (`routes.*` / `routes.*Hint`) and are
 * resolved here via `t()`. Real views land in Phase 3.2 / 3.3 / 6.
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";

const route = useRoute();
const { t } = useI18n();
const title = computed(() => (route.meta.title ? t(route.meta.title) : t("common.untitled")));
const hint = computed(() => (route.meta.hint ? t(route.meta.hint) : ""));
</script>

<template>
  <div class="flex flex-1 min-w-0 flex-col items-center justify-center gap-2 px-6 text-center">
    <div class="text-sm font-medium text-text-muted">{{ title }}</div>
    <div class="max-w-sm text-xs text-text-muted">{{ hint }}</div>
  </div>
</template>