<script setup lang="ts">
/**
 * Modal dialog displaying the latest release notes / changelog when a new version
 * is detected automatically or opened via Settings / TitleBar.
 */
import { computed } from "vue";
import { useUpdaterStore } from "@/stores/updater";
import { parseMarkdownToHtml, formatBundledChangelog } from "@/utils/markdown";
import { Icon } from "@notesnook-vue/ui-vue";
import rawChangelog from "../../../../../CHANGELOG.md?raw";

const updater = useUpdaterStore();

const versionTag = computed(() => {
  const v = updater.status.version || __APP_VERSION__;
  return v ? (v.startsWith("v") ? v : `v${v}`) : `v${__APP_VERSION__}`;
});

const downloading = computed(() => updater.phase === "downloading");

const fallbackNotes = formatBundledChangelog(rawChangelog);

const changelogContent = computed(() => {
  return updater.status.releaseNotes?.trim() || fallbackNotes;
});

const renderedHtml = computed(() => {
  return parseMarkdownToHtml(changelogContent.value);
});

const statusBadgeLabel = computed(() => {
  if (updater.readyToInstall) return "Ready to Install";
  if (updater.updateAvailable) return "Update Available";
  return "Up to Date";
});

const statusBadgeClass = computed(() => {
  if (updater.readyToInstall || (!updater.updateAvailable && !updater.readyToInstall)) {
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20";
  }
  return "bg-accent/10 text-accent border border-accent/20";
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
                  :class="statusBadgeClass"
                >
                  {{ statusBadgeLabel }}
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

        <!-- Download error banner if present -->
        <div v-if="updater.lastError" class="py-2 px-3 my-2 rounded bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500 font-medium flex items-center gap-2">
          <Icon name="alert-circle" :size="16" />
          <span>{{ updater.lastError }}</span>
        </div>

        <!-- Scrollable Rendered Markdown Body -->
        <div
          class="my-4 flex-1 overflow-y-auto pr-1 text-xs text-text-muted leading-relaxed font-sans changelog-body"
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

<style scoped>
.changelog-body :deep(h1),
.changelog-body :deep(h2) {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--color-text, currentColor);
  margin-top: 1rem;
  margin-bottom: 0.5rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
}

.changelog-body :deep(h3),
.changelog-body :deep(h4) {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-text, currentColor);
  margin-top: 0.875rem;
  margin-bottom: 0.375rem;
}

.changelog-body :deep(p) {
  margin-top: 0.25rem;
  margin-bottom: 0.5rem;
  line-height: 1.5;
}

.changelog-body :deep(ul),
.changelog-body :deep(ol) {
  margin-top: 0.375rem;
  margin-bottom: 0.5rem;
  padding-left: 1.25rem;
  list-style-type: disc;
}

.changelog-body :deep(li) {
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
  line-height: 1.5;
}

.changelog-body :deep(code) {
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  background-color: var(--color-surface-muted, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  color: var(--color-accent, #3b82f6);
}

.changelog-body :deep(a) {
  color: var(--color-accent, #3b82f6);
  text-decoration: underline;
}

.changelog-body :deep(hr) {
  margin-top: 1rem;
  margin-bottom: 1rem;
  border-color: var(--color-border, rgba(255, 255, 255, 0.1));
}
</style>
