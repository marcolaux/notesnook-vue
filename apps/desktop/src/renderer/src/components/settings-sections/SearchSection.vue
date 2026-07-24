<script setup lang="ts">
/**
 * Dedicated Search & Retrieval settings section.
 * Configures On-Device Vector Search (snowflake-arctic-embed-s + sqlite-vec),
 * hybrid Reciprocal Rank Fusion (RRF) toggle, indexing controls, and storage maintenance.
 */
import { ref } from "vue";
import { Surface, Flex, Text } from "@notesnook-vue/ui-vue";
import { useSettingsStore } from "@/stores/settings";
import { purgeVectorIndex } from "@/utils/vector-search";

const settings = useSettingsStore();
const purgeStatus = ref<string | null>(null);

async function handlePurgeIndex(): Promise<void> {
  purgeStatus.value = "Purging vector index...";
  await purgeVectorIndex();
  purgeStatus.value = "Vector storage purged successfully.";
  setTimeout(() => {
    purgeStatus.value = null;
  }, 3000);
}
</script>

<template>
  <Surface class="rounded-xl border border-border p-5">
    <Flex direction="column" :gap="4">
      <Flex direction="column" :gap="1">
        <Text as="h2" variant="heading" size="md">Search & Retrieval</Text>
        <Text variant="body" size="xs" class="text-text-muted">
          Configure on-device hybrid vector search, index management, and fallback controls.
        </Text>
      </Flex>

      <!-- Semantic Vector Search Toggle & Status -->
      <Flex direction="column" :gap="3" class="rounded-lg border border-border bg-surface-muted/30 p-4">
        <Flex align="center" justify="between">
          <Flex direction="column" :gap="1">
            <Text variant="body" size="sm" class="font-medium text-text">Semantic Search (Vector Embeddings)</Text>
            <Text variant="body" size="xs" class="text-text-muted max-w-md">
              Finds notes by context and semantic similarity using local vector embeddings blended with FTS5 lexical search (Reciprocal Rank Fusion).
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
          <span class="font-medium text-text-muted">Active Engine Mode:</span>
          <span
            class="px-2 py-0.5 rounded-full font-mono text-[11px]"
            :class="settings.semanticSearchEnabled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'"
          >
            {{ settings.semanticSearchEnabled ? "Hybrid RRF (FTS5 + Vector Embeddings)" : "Pure FTS5 Lexical Search (Opted Out)" }}
          </span>
        </Flex>
      </Flex>

      <!-- Technical Architecture Overview -->
      <Flex direction="column" :gap="2">
        <Text variant="body" size="sm" class="font-medium text-text">Local Architecture & Specifications</Text>
        <div class="grid grid-cols-2 gap-3 text-xs">
          <div class="rounded-lg border border-border p-3 bg-surface">
            <Text variant="body" size="xs" class="font-medium text-text-muted">Embedding Model</Text>
            <div class="mt-1 font-semibold text-text">snowflake-arctic-embed-s (INT8)</div>
            <div class="mt-0.5 text-text-muted">384 dimensions • ~33 MB model</div>
          </div>
          <div class="rounded-lg border border-border p-3 bg-surface">
            <Text variant="body" size="xs" class="font-medium text-text-muted">Storage Engine</Text>
            <div class="mt-1 font-semibold text-text">sqlite-vec (vec0 virtual table)</div>
            <div class="mt-0.5 text-text-muted">Encrypted inside user database file</div>
          </div>
          <div class="rounded-lg border border-border p-3 bg-surface">
            <Text variant="body" size="xs" class="font-medium text-text-muted">Inference Runtime</Text>
            <div class="mt-1 font-semibold text-text">Transformers.js Web Worker</div>
            <div class="mt-0.5 text-text-muted">WebGPU accelerated (WASM SIMD fallback)</div>
          </div>
          <div class="rounded-lg border border-border p-3 bg-surface">
            <Text variant="body" size="xs" class="font-medium text-text-muted">Privacy & E2EE</Text>
            <div class="mt-1 font-semibold text-emerald-600 dark:text-emerald-400">100% On-Device & Offline</div>
            <div class="mt-0.5 text-text-muted">Zero cloud dependencies</div>
          </div>
        </div>
      </Flex>

      <!-- Storage Maintenance & Reclaim -->
      <Flex direction="column" :gap="2" class="pt-2 border-t border-border">
        <Text variant="body" size="sm" class="font-medium text-text">Storage Maintenance</Text>
        <Flex align="center" justify="between" class="rounded-lg border border-border p-3 bg-surface">
          <Flex direction="column" :gap="1">
            <Text variant="body" size="sm" class="font-medium text-text">Purge Vector Storage</Text>
            <Text variant="body" size="xs" class="text-text-muted">
              Clear all stored vector embeddings from `vec_notes` table to reclaim disk space.
            </Text>
          </Flex>
          <button
            type="button"
            class="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-surface hover:bg-surface-hover text-text transition-colors"
            @click="handlePurgeIndex"
          >
            Purge Vector Storage
          </button>
        </Flex>
        <div v-if="purgeStatus" class="text-xs text-accent font-medium pt-1">
          {{ purgeStatus }}
        </div>
      </Flex>
    </Flex>
  </Surface>
</template>
