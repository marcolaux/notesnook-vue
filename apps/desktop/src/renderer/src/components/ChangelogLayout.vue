<script setup lang="ts">
/**
 * Standalone window layout for the Changelog / What's New release notes view.
 * Loaded in its own Electron BrowserWindow when `?window=changelog`.
 *
 * The baked `__CHANGELOG_CONTENT__` only ever contains entries up to the
 * installed version (it's read at build time), so on mount we fetch the raw
 * `CHANGELOG.md` from the app's GitHub repo (`desktop.changelog.fetchLatest`)
 * and render its top (newest) section. The baked text is the fallback used
 * while the fetch is in flight or when it fails — the window never blocks or
 * crashes on a network error.
 */
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useUpdaterStore } from "@/stores/updater";
import { useTitleBarStore } from "@/stores/titlebar";
import { desktop } from "@/platform/desktop-bridge";
import { parseMarkdownToHtml, formatChangelogRange, getLatestChangelogVersion } from "@/utils/markdown";
import { isNewerUpstreamRelease } from "@contracts/upstream-semver";
import { Icon } from "@notesnook-vue/ui-vue";

const updater = useUpdaterStore();
const titlebar = useTitleBarStore();
const { t } = useI18n();

const rawChangelogText = typeof __CHANGELOG_CONTENT__ !== "undefined" ? __CHANGELOG_CONTENT__ : "";
const latestBundledVersion = getLatestChangelogVersion(rawChangelogText);

// Remote changelog fetched from the app's GitHub repo on mount. `null` until
// the fetch resolves (or fails). The renderer parses the newest version out of
// the raw text with the same helpers used on the baked content.
const remoteText = ref<string | null>(null);
const loadingRemote = ref(false);

const remoteVersion = computed(() => (remoteText.value ? getLatestChangelogVersion(remoteText.value) : null));
const remoteVersionTag = computed(() => {
  const v = remoteVersion.value;
  return v ? (v.startsWith("v") ? v : `v${v}`) : null;
});
/** `true` when the remote newest version is semver-newer than the installed one. */
const isNewerThanInstalled = computed(() => {
  const v = remoteVersion.value;
  return v ? isNewerUpstreamRelease(v, __APP_VERSION__) : false;
});

const targetVersion = computed(() => {
  if (updater.status.version) return updater.status.version;
  if (remoteVersion.value) return remoteVersion.value;
  if (latestBundledVersion) return latestBundledVersion;
  return __APP_VERSION__;
});

const versionTag = computed(() => {
  const v = targetVersion.value;
  return v ? (v.startsWith("v") ? v : `v${v}`) : `v${__APP_VERSION__}`;
});

const downloading = computed(() => updater.phase === "downloading");

const remoteNotes = computed(() => {
  if (!remoteText.value) return "";
  // Range from the installed version up to the newest (inclusive), parsed out
  // of the fetched remote changelog — so an older install sees every release
  // note it has missed, not just the single newest section.
  return formatChangelogRange(remoteText.value, __APP_VERSION__);
});

const fallbackNotes = computed(() => {
  // Baked text only goes up to the installed version, so the range against it
  // collapses to the installed section — the last-resort fallback.
  return formatChangelogRange(rawChangelogText, __APP_VERSION__);
});

// Remote installed→newest range wins; then the provider's single-version
// release notes; then the baked installed-version section as a final fallback.
const changelogContent = computed(() => {
  return remoteNotes.value || updater.status.releaseNotes?.trim() || fallbackNotes.value;
});

const renderedHtml = computed(() => {
  return parseMarkdownToHtml(changelogContent.value);
});

// Subtle "new version available" hint — only when the remote newest version is
// newer than installed AND the auto-updater hasn't already surfaced an update
// (the Download/Install footer handles that case). Links to the GitHub release.
const showNewerHint = computed(
  () => isNewerThanInstalled.value && !updater.updateAvailable && !updater.readyToInstall
);

const releaseUrl = computed(() => {
  const tag = remoteVersionTag.value;
  return tag ? `https://github.com/marcolaux/notesnook-vue/releases/tag/${tag}` : null;
});

function openReleaseUrl(): void {
  const url = releaseUrl.value;
  if (url) window.open(url, "_blank", "noopener");
}

const statusBadgeLabel = computed(() => {
  if (updater.readyToInstall) return t("changelog.badgeReady");
  if (updater.updateAvailable) return t("changelog.badgeAvailable");
  return t("changelog.badgeUpToDate");
});

const statusBadgeClass = computed(() => {
  if (updater.readyToInstall || (!updater.updateAvailable && !updater.readyToInstall)) {
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20";
  }
  return "bg-accent/10 text-accent border border-accent/20";
});

onMounted(() => {
  loadingRemote.value = true;
  desktop.changelog.fetchLatest
    .query()
    .then((res) => {
      if (res && !res.error && res.text) remoteText.value = res.text;
    })
    .catch(() => {
      // Bridge failure → silently fall back to the baked changelog.
    })
    .finally(() => {
      loadingRemote.value = false;
    });
});

function handleClose(): void {
  void desktop.window.close.mutate().catch(() => {
    window.close();
  });
}

function handleAction(): void {
  if (updater.readyToInstall) {
    void updater.installUpdate();
  } else if (updater.updateAvailable) {
    void updater.downloadUpdate();
  }
}
</script>

<template>
  <div class="flex h-screen w-screen flex-col overflow-hidden bg-background text-text select-none">
    <!-- Window Drag TitleBar -->
    <div
      class="titlebar-drag flex h-10 shrink-0 items-center justify-between border-b border-glass-border bg-glass-surface backdrop-blur-2xl px-4"
      :style="{ paddingLeft: titlebar.padding.left + 'px', paddingRight: titlebar.padding.right + 'px' }"
    >
      <div class="flex items-center gap-2 text-xs font-semibold text-text">
        <Icon name="sparkles" :size="14" class="text-accent" />
        <span>{{ t("changelog.whatsNew") }}</span>
      </div>
      <button
        type="button"
        class="titlebar-no-drag grid h-6 w-6 place-items-center rounded text-text-muted hover:bg-glass-hover hover:text-text transition-colors"
        :title="t('changelog.closeWindow')"
        @click="handleClose"
      >
        <Icon name="x" :size="14" />
      </button>
    </div>

    <!-- Main Content Container -->
    <div class="flex flex-1 flex-col overflow-hidden p-6 gap-4">
      <!-- Header Banner -->
      <div class="flex items-center justify-between pb-4 border-b border-glass-border">
        <div class="flex items-center gap-3">
          <div class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent shadow-sm">
            <Icon name="sparkles" :size="22" />
          </div>
          <div>
            <h1 class="text-base font-bold text-text">{{ t("changelog.whatsNewIn", { version: versionTag }) }}</h1>
            <div class="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
              <span class="px-2 py-0.5 rounded-full font-mono text-[10px]" :class="statusBadgeClass">
                {{ statusBadgeLabel }}
              </span>
              <span>{{ t("changelog.releaseLabel") }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Newer-than-installed hint (remote newest version > installed, and the
           auto-updater hasn't already flagged an update). Links to the release. -->
      <div
        v-if="showNewerHint"
        class="py-2 px-3 rounded-lg bg-accent/10 border border-accent/20 text-xs text-accent flex items-center gap-2"
      >
        <Icon name="gift" :size="16" class="shrink-0" />
        <span class="flex-1">{{ t("changelog.newerAvailable", { version: remoteVersionTag }) }}</span>
        <button
          type="button"
          class="underline hover:opacity-80 transition-opacity font-medium flex items-center gap-1"
          @click="openReleaseUrl"
        >
          {{ t("changelog.viewRelease") }}
          <Icon name="external-link" :size="12" />
        </button>
      </div>

      <!-- Fetching-remote loading line -->
      <div
        v-if="loadingRemote"
        class="py-1.5 px-3 rounded-lg bg-glass-hover border border-glass-border text-xs text-text-muted flex items-center gap-2"
      >
        <Icon name="loader-circle" :size="14" class="shrink-0 animate-spin" />
        <span>{{ t("changelog.fetchingLatest") }}</span>
      </div>

      <!-- Download progress banner -->
      <div v-if="downloading" class="py-2.5 px-3 rounded-lg bg-glass-hover border border-glass-border flex flex-col gap-1.5">
        <div class="flex justify-between text-xs font-medium">
          <span class="text-text">{{ t("changelog.downloading") }}</span>
          <span class="text-accent">{{ updater.status.progress }}%</span>
        </div>
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-glass-border">
          <div
            class="h-full rounded-full bg-accent transition-[width] duration-150"
            :style="{ width: `${updater.status.progress}%` }"
          />
        </div>
      </div>

      <!-- Download error banner -->
      <div v-if="updater.lastError" class="py-2 px-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500 font-medium flex items-center gap-2">
        <Icon name="alert-circle" :size="16" />
        <span>{{ updater.lastError }}</span>
      </div>

      <!-- Scrollable Markdown Release Notes Body -->
      <div
        class="flex-1 overflow-y-auto pr-2 text-xs text-text-muted leading-relaxed font-sans changelog-body select-text"
        v-html="renderedHtml"
      />

      <!-- Footer Action Bar -->
      <div class="flex items-center justify-between pt-3 border-t border-glass-border mt-auto">
        <button
          type="button"
          class="px-4 py-2 text-xs font-medium rounded-xl border border-glass-border bg-glass-hover hover:bg-glass-active text-text transition-colors"
          @click="handleClose"
        >
          {{ t("common.close") }}
        </button>
        <button
          v-if="updater.updateAvailable || updater.readyToInstall"
          type="button"
          class="px-4 py-2 text-xs font-medium rounded-xl bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg"
          :disabled="updater.busy || downloading"
          @click="handleAction"
        >
          <template v-if="updater.readyToInstall">{{ t("changelog.installRestart") }}</template>
          <template v-else-if="downloading">{{ t("changelog.downloadingDots") }}</template>
          <template v-else>{{ t("changelog.downloadUpdate") }}</template>
        </button>
      </div>
    </div>
  </div>
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
  border-bottom: 1px solid var(--color-glass-border, rgba(255, 255, 255, 0.1));
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
  background-color: var(--color-glass-hover, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--color-glass-border, rgba(255, 255, 255, 0.1));
  color: var(--color-accent, #3b82f6);
}

.changelog-body :deep(a) {
  color: var(--color-accent, #3b82f6);
  text-decoration: underline;
}

.changelog-body :deep(hr) {
  margin-top: 1rem;
  margin-bottom: 1rem;
  border-color: var(--color-glass-border, rgba(255, 255, 255, 0.1));
}
</style>
