<script setup lang="ts">
/**
 * Dedicated Search & Retrieval settings section.
 * Configures On-Device Vector Search (snowflake-arctic-embed-s + sqlite-vec),
 * hybrid Reciprocal Rank Fusion (RRF) toggle, indexing controls, and storage maintenance.
 */
import { ref } from "vue";
import { Surface, Flex, Text } from "@notesnook-vue/ui-vue";
import { useI18n } from "vue-i18n";
import { useSettingsStore } from "@/stores/settings";
import { purgeVectorIndex } from "@/utils/vector-search";

const settings = useSettingsStore();
const { t } = useI18n();
const purgeStatus = ref<string | null>(null);

async function handlePurgeIndex(): Promise<void> {
  purgeStatus.value = t("settings.search.purging");
  await purgeVectorIndex();
  purgeStatus.value = t("settings.search.purged");
  setTimeout(() => {
    purgeStatus.value = null;
  }, 3000);
}
</script>

<template>
  <Surface class="rounded-xl border border-border p-5">
    <Flex direction="column" :gap="4">
      <Flex direction="column" :gap="1">
        <Text as="h2" variant="heading" size="md">{{ t("settings.search.title") }}</Text>
        <Text variant="body" size="xs" class="text-text-muted">
          {{ t("settings.search.subtitle") }}
        </Text>
      </Flex>

      <!-- Semantic Vector Search Toggle & Status -->
      <Flex direction="column" :gap="3" class="rounded-lg border border-border bg-surface-muted/30 p-4">
        <Flex align="center" justify="between">
          <Flex direction="column" :gap="1">
            <Text variant="body" size="sm" class="font-medium text-text">{{ t("settings.search.semanticTitle") }}</Text>
            <Text variant="body" size="xs" class="text-text-muted max-w-md">
              {{ t("settings.search.semanticDesc") }}
            </Text>
          </Flex>
          <label class="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              :checked="settings.semanticSearchEnabled"
              class="sr-only peer"
              @change="settings.setSemanticSearchEnabled(($event.target as HTMLInputElement).checked)"
            />
            <div class="w-9 h-5 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
          </label>
        </Flex>

        <Flex align="center" :gap="2" class="pt-2 border-t border-border/50 text-xs">
          <span class="font-medium text-text-muted">{{ t("settings.search.activeMode") }}</span>
          <span
            class="px-2 py-0.5 rounded-full font-mono text-[11px]"
            :class="settings.semanticSearchEnabled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'"
          >
            {{ settings.semanticSearchEnabled ? t("settings.search.modeHybrid") : t("settings.search.modeLexical") }}
          </span>
        </Flex>
      </Flex>

      <!-- Technical Architecture Overview -->
      <Flex direction="column" :gap="2">
        <Text variant="body" size="sm" class="font-medium text-text">{{ t("settings.search.archTitle") }}</Text>
        <div class="grid grid-cols-2 gap-3 text-xs">
          <div class="rounded-lg border border-border p-3 bg-surface">
            <Text variant="body" size="xs" class="font-medium text-text-muted">{{ t("settings.search.embeddingModel") }}</Text>
            <div class="mt-1 font-semibold text-text">{{ t("settings.search.embeddingModelValue") }}</div>
            <div class="mt-0.5 text-text-muted">{{ t("settings.search.embeddingModelSpec") }}</div>
          </div>
          <div class="rounded-lg border border-border p-3 bg-surface">
            <Text variant="body" size="xs" class="font-medium text-text-muted">{{ t("settings.search.storageEngine") }}</Text>
            <div class="mt-1 font-semibold text-text">{{ t("settings.search.storageEngineValue") }}</div>
            <div class="mt-0.5 text-text-muted">{{ t("settings.search.storageEngineSpec") }}</div>
          </div>
          <div class="rounded-lg border border-border p-3 bg-surface">
            <Text variant="body" size="xs" class="font-medium text-text-muted">{{ t("settings.search.inferenceRuntime") }}</Text>
            <div class="mt-1 font-semibold text-text">{{ t("settings.search.inferenceRuntimeValue") }}</div>
            <div class="mt-0.5 text-text-muted">{{ t("settings.search.inferenceRuntimeSpec") }}</div>
          </div>
          <div class="rounded-lg border border-border p-3 bg-surface">
            <Text variant="body" size="xs" class="font-medium text-text-muted">{{ t("settings.search.privacyE2ee") }}</Text>
            <div class="mt-1 font-semibold text-emerald-600 dark:text-emerald-400">{{ t("settings.search.privacyValue") }}</div>
            <div class="mt-0.5 text-text-muted">{{ t("settings.search.privacySpec") }}</div>
          </div>
        </div>
      </Flex>

      <!-- Storage Maintenance & Reclaim -->
      <Flex direction="column" :gap="2" class="pt-2 border-t border-border">
        <Text variant="body" size="sm" class="font-medium text-text">{{ t("settings.search.purgeTitle") }}</Text>
        <Flex align="center" justify="between" class="rounded-lg border border-border p-3 bg-surface">
          <Flex direction="column" :gap="1">
            <Text variant="body" size="sm" class="font-medium text-text">{{ t("settings.search.purgeVectorStorage") }}</Text>
            <Text variant="body" size="xs" class="text-text-muted">
              {{ t("settings.search.purgeDesc") }}
            </Text>
          </Flex>
          <button
            type="button"
            class="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-surface hover:bg-surface-hover text-text transition-colors"
            @click="handlePurgeIndex"
          >
            {{ t("settings.search.purgeVectorStorage") }}
          </button>
        </Flex>
        <div v-if="purgeStatus" class="text-xs text-accent font-medium pt-1">
          {{ purgeStatus }}
        </div>
      </Flex>
    </Flex>
  </Surface>
</template>
