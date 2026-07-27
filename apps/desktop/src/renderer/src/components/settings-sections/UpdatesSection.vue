<script setup lang="ts">
/**
 * Updates settings section — the user-facing surface for the auto-updater
 * (Phase 6.2 control slice + continuous-channel publish pipeline).
 *
 * Binds `useUpdaterStore` (reached over the tRPC bridge as `desktop.updater.*`):
 * shows the running version (`__APP_VERSION__`, injected at build time), the
 * current update status, and Check / Download / Install-and-restart actions.
 * Live download progress flows in via the `updater:status` IPC subscription
 * wired in the store's `init()`. Auto-download stays off — the user chooses
 * when to download and when to quit-and-restart into the new version.
 *
 * Dev is a no-op: the main impl short-circuits to an idle status when
 * `!app.isPackaged`, so "Check for updates" resolves with "Up to date" without
 * any network. A real update only appears in a packaged build once a newer
 * release is published to the GitHub `latest` channel.
 */
import { computed, onMounted } from "vue";
import { Surface, Flex, Text, Button } from "@notesnook-vue/ui-vue";
import { useI18n } from "vue-i18n";
import { useUpdaterStore } from "@/stores/updater";
import { useSettingsStore } from "@/stores/settings";

const updater = useUpdaterStore();
const settings = useSettingsStore();
const { t } = useI18n();

const currentVersion = `v${__APP_VERSION__}`;
const downloading = computed(() => updater.phase === "downloading");
const isDev = import.meta.env.DEV;
/** In dev the Logging gate is forced on (see `readLoggingEnabled`), so the
 *  toggle is locked — shown for visibility, not interactive. */
const loggingLocked = computed(() => isDev);

// Kick a check the moment the section is opened so the user sees a fresh
// "Up to date" / "Update available" verdict rather than the stale pre-check
// "Checking for updates…" snapshot. The section remounts on each navigation
// (no KeepAlive), so this fires every time the user opens Updates. Guarded
// against an in-flight check (e.g. the boot auto-check) to avoid a double call.
onMounted(() => {
  if (!updater.busy) void updater.checkForUpdates();
});
</script>

<template>
  <Surface class="rounded-xl border border-border p-5">
    <Flex direction="column" :gap="4">
      <Flex direction="column" :gap="1">
        <Text as="h2" variant="heading" size="md">{{ t("settings.updates.title") }}</Text>
        <Text variant="body" size="xs" class="text-text-muted">
          {{ t("settings.updates.versionLine", { version: currentVersion }) }}
        </Text>
      </Flex>

      <!-- Status line -->
      <Flex direction="column" :gap="1">
        <Text variant="body" size="sm" class="text-text">{{ updater.statusText }}</Text>
        <Text
          v-if="updater.updateAvailable && updater.status.version"
          variant="body"
          size="xs"
          class="text-accent"
        >
          {{ t("settings.updates.newVersion", { version: updater.status.version }) }}
        </Text>
      </Flex>

      <!-- Download progress -->
      <div v-if="downloading" class="flex flex-col gap-1">
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface">
          <div
            class="h-full rounded-full bg-accent transition-[width] duration-150"
            :style="{ width: `${updater.status.progress}%` }"
          />
        </div>
        <Text variant="body" size="xs" class="text-text-muted">{{ updater.status.progress }}%</Text>
      </div>

      <!-- Actions -->
      <Flex direction="row" :gap="2" class="flex-wrap items-center">
        <Button
          variant="secondary"
          :disabled="updater.busy || downloading"
          @click="updater.checkForUpdates"
        >
          {{ t("settings.updates.checkForUpdates") }}
        </Button>
        <Button
          variant="ghost"
          @click="updater.openChangelog"
        >
          {{ t("settings.updates.viewChangelog") }}
        </Button>
        <Button
          v-if="isDev"
          variant="secondary"
          @click="updater.triggerTestChangelog"
        >
          {{ t("settings.updates.testChangelog") }}
        </Button>
        <Button
          v-if="updater.updateAvailable && !updater.readyToInstall"
          variant="primary"
          :disabled="updater.busy"
          @click="updater.downloadUpdate"
        >
          {{ t("settings.updates.download") }}
        </Button>
        <Button
          v-if="updater.readyToInstall"
          variant="primary"
          :disabled="updater.busy"
          @click="updater.installUpdate"
        >
          {{ t("settings.updates.installRestart") }}
        </Button>
      </Flex>

      <Text v-if="updater.lastError" variant="body" size="xs" class="text-[var(--red-static)]">
        {{ updater.lastError }}
        <button type="button" class="ml-1 underline" @click="updater.clearError">{{ t("settings.updates.dismiss") }}</button>
      </Text>
    </Flex>
  </Surface>

  <!-- Logging — diagnostic console output gate (forced on in dev) -->
  <Surface class="mt-6 rounded-xl border border-border p-5">
    <Flex direction="column" :gap="4">
      <Flex direction="column" :gap="1">
        <Text as="h2" variant="heading" size="md">{{ t("settings.updates.loggingTitle") }}</Text>
        <Text variant="body" size="xs" class="text-text-muted">
          {{ t("settings.updates.loggingDesc") }}
        </Text>
      </Flex>

      <Flex direction="column" :gap="3" class="rounded-lg border border-border bg-surface-muted/30 p-4">
        <Flex align="center" justify="between">
          <Flex direction="column" :gap="1">
            <Text variant="body" size="sm" class="font-medium text-text">{{ t("settings.updates.enableLogging") }}</Text>
            <Text variant="body" size="xs" class="text-text-muted max-w-md">
              {{ loggingLocked ? t("settings.updates.loggingForced") : t("settings.updates.loggingDefault") }}
            </Text>
          </Flex>
          <label class="relative inline-flex cursor-pointer items-center" :class="{ 'opacity-60': loggingLocked }">
            <input
              type="checkbox"
              :checked="settings.loggingEnabled"
              :disabled="loggingLocked"
              class="sr-only peer"
              @change="settings.setLoggingEnabled(($event.target as HTMLInputElement).checked)"
            />
            <div class="w-9 h-5 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
          </label>
        </Flex>
      </Flex>
    </Flex>
  </Surface>
</template>