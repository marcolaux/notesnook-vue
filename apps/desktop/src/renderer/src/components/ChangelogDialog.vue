<script setup lang="ts">
/**
 * Modal dialog displaying the latest release notes / changelog when a new version
 * is detected automatically or opened via Settings / TitleBar.
 */
import { computed } from "vue";
import { useUpdaterStore } from "@/stores/updater";
import { parseMarkdownToHtml } from "@/utils/markdown";
import { Icon } from "@notesnook-vue/ui-vue";

const updater = useUpdaterStore();

const versionTag = computed(() => {
  const v = updater.status.version;
  return v ? (v.startsWith("v") ? v : `v${v}`) : "Latest Release";
});

const downloading = computed(() => updater.phase === "downloading");

const fallbackNotes = `### Highlights & Improvements

#### 🚀 On-Device Hybrid Vector Search
- Introduced 100% local, offline-first vector search powered by **sqlite-vec** and **snowflake-arctic-embed-s**.
- Blends traditional FTS5 keyword matching with AI semantic similarity using **Reciprocal Rank Fusion (RRF)**.
- Full E2EE & privacy: zero cloud dependencies, embeddings are stored encrypted in your local database.

#### ⚡ Performance & Idle Queue
- Non-blocking embedding generation powered by background idle frames (\`requestIdleCallback\`).
- Note opening and preview loads remain instantaneous.
- Added live indexing status indicator to the TitleBar.

#### ⚙️ Settings & Privacy Controls
- Dedicated **Search & Retrieval** section under Settings -> Customization.
- Toggle Semantic Search on/off anytime (opt-out falls back 100% to FTS5 lexical search).
- Reclaim disk space anytime via the **Purge Vector Storage** button.`;

const changelogContent = computed(() => {
  return updater.status.releaseNotes?.trim() || fallbackNotes;
});

const renderedHtml = computed(() => {
  return parseMarkdownToHtml(changelogContent.value);
});

function handleAction(): void {
  if (updater.readyToInstall) {
    void updater.installUpdate();
  } else if (updater.updateAvailable) {
    void updater.downloadUpdate();
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="updater.showChangelog"
      class="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
      @mousedown.self="updater.dismissChangelog()"
    >
      <div
        class="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl backdrop-blur-2xl text-text max-h-[85vh] flex flex-col"
        @mousedown.stop
      >
        <!-- Header -->
        <div class="flex items-start justify-between gap-4 pb-4 border-b border-border">
          <div class="flex items-center gap-3">
            <div class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
              <Icon name="sparkles" :size="22" />
            </div>
            <div>
              <h3 class="text-base font-semibold text-text">What's New in {{ versionTag }}</h3>
              <div class="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
                <span
                  class="px-2 py-0.5 rounded-full font-mono text-[10px]"
                  :class="updater.readyToInstall ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-accent/10 text-accent border border-accent/20'"
                >
                  {{ updater.readyToInstall ? "Ready to Install" : "Update Available" }}
                </span>
                <span>• Notesnook Desktop Release</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            class="text-text-muted hover:text-text p-1 rounded-md transition-colors"
            title="Close"
            @click="updater.dismissChangelog()"
          >
            <Icon name="x" :size="18" />
          </button>
        </div>

        <!-- Download progress if downloading -->
        <div v-if="downloading" class="py-3 border-b border-border flex flex-col gap-1.5">
          <div class="flex justify-between text-xs font-medium">
            <span class="text-text">Downloading update...</span>
            <span class="text-accent">{{ updater.status.progress }}%</span>
          </div>
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              class="h-full rounded-full bg-accent transition-[width] duration-150"
              :style="{ width: `${updater.status.progress}%` }"
            />
          </div>
        </div>

        <!-- Scrollable Rendered Markdown Body -->
        <div
          class="my-4 flex-1 overflow-y-auto pr-1 text-xs text-text-muted leading-relaxed font-sans"
          v-html="renderedHtml"
        />

        <!-- Footer Actions -->
        <div class="flex items-center justify-between pt-3 border-t border-border mt-auto">
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-medium rounded-md border border-border bg-transparent hover:bg-surface-hover text-text transition-colors"
            @click="updater.dismissChangelog()"
          >
            Remind Me Later
          </button>
          <button
            type="button"
            class="px-4 py-1.5 text-xs font-medium rounded-md border border-accent bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            :disabled="updater.busy || downloading"
            @click="handleAction"
          >
            <template v-if="updater.readyToInstall">Install and Restart</template>
            <template v-else-if="downloading">Downloading...</template>
            <template v-else>Download & Update</template>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
