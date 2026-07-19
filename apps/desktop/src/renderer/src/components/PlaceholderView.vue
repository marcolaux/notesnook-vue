<script setup lang="ts">
/**
 * Placeholder for unbuilt sidebar collections (Notebooks / Tags / Monographs /
 * Archive / Trash). Title + hint come from the matched route's `meta` (see
 * `router/routes.ts`). Real views land in Phase 3.2 / 3.3 / 6.
 */
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const title = computed(() => route.meta.title ?? "Untitled");
const hint = computed(() => route.meta.hint ?? "");
</script>

<template>
  <div class="flex flex-1 min-w-0 flex-col items-center justify-center gap-2 px-6 text-center">
    <div class="text-sm font-medium text-white/70">{{ title }}</div>
    <div class="max-w-sm text-xs text-white/40">{{ hint }}</div>
  </div>
</template>