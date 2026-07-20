<script setup lang="ts">
/**
 * Sync settings section (Phase 2) — manual sync controls + the client-only
 * sync toggles. Two layers, mirroring upstream's split:
 *
 *  - **Manual controls** (`useSyncStore`): Sync now / Stop / Cancel — these
 *    genuinely work today (`db.sync()` / `db.syncer.stop()` / `cancel()`).
 *    "Sync now" passes `offlineMode` from the Full-offline-mode toggle.
 *  - **Toggles** (`useConfigStore`, localStorage — NOT synced): Enable sync
 *    (`syncEnabled`) gates the manual button here AND the boot/auto sync in
 *    `App.vue`; Full offline mode (`fullOfflineMode`) is passed to sync.
 *
 * The last-synced timestamp + live state come from `useStatusStore` (event-
 * driven display). The settings window is a separate renderer, so this section
 * binds sync events + seeds the clock on mount (the main window does it on boot;
 * the settings window does not).
 *
 * Deferred (need core-internal wiring + on-site verification): `autoSyncEnabled`
 * (gates the post-login auto-sync — wired in `App.vue`, toggle shown once the
 * auto-sync timer is verified) and `isRealtimeSyncEnabled` (core realtime/SSE —
 * not shown until wired). Showing a toggle that does nothing is worse than
 * omitting it, so they land with their behaviour.
 *
 * Cross-window note: the token lives in the DB (KV), so `db.sync()` works from
 * this window. But sync is normally driven from the main window; running it
 * here is fine (the DB is shared) though the main window's status store won't
 * see the events (per-process EV) until it re-queries.
 */
import { computed, onMounted, onUnmounted } from "vue";
import { Surface, Flex, Text, Button } from "@notesnook-vue/ui-vue";
import { useSyncStore } from "@/stores/sync";
import { useStatusStore } from "@/stores/status";
import { useConfigStore } from "@/stores/config";
import { formatSyncRelative } from "@/utils/status";

const sync = useSyncStore();
const status = useStatusStore();
const config = useConfigStore();

onMounted(() => {
  // The settings window doesn't bind sync events / clock on boot — do it here
  // so the live state + relative timestamp are current while this section is
  // open. Idempotent (bind + startClock guard against double-binding).
  status.bindSyncEvents();
  status.startClock();
  void status.refreshSync();
});

onUnmounted(() => {
  // Stop the clock when leaving the section so we don't keep a timer alive in
  // the settings window. (bindSyncEvents is idempotent/leak-free; left bound.)
  status.stopClock();
});

const lastSyncedLabel = computed(() => formatSyncRelative(status.lastSynced, status.now));
const stateLabel = computed(() => {
  switch (status.syncState) {
    case "syncing":
      return "Syncing…";
    case "error":
      return "Sync error";
    default:
      return lastSyncedLabel.value;
  }
});

/** Sync-now is disabled while a sync is busy, or when sync is turned off, or
 *  while the window has no token (not logged in — surfaced via the error). */
const canSyncNow = computed(() => !sync.busy && config.syncEnabled);

async function onSyncNow(): Promise<void> {
  // Build options conditionally — `exactOptionalPropertyTypes` rejects an
  // explicit `undefined` for an optional prop (TS2379), so only set
  // `offlineMode` when full-offline mode is on.
  const input: { offlineMode?: boolean } = {};
  if (config.fullOfflineMode) input.offlineMode = true;
  await sync.startSync(input);
}
function onStop(): void {
  void sync.stopSync();
}
function onCancel(): void {
  void sync.cancelSync();
}

function toggleSyncEnabled(e: Event): void {
  config.setSyncEnabled((e.target as HTMLInputElement).checked);
}
function toggleFullOffline(e: Event): void {
  config.setFullOfflineMode((e.target as HTMLInputElement).checked);
}
</script>

<template>
  <Surface class="rounded-xl border border-border p-5">
    <Flex direction="column" :gap="4">
      <Text as="h2" variant="heading" size="md">Sync</Text>

      <!-- Status -->
      <Flex direction="column" :gap="1">
        <Text variant="body" size="sm" class="text-text-muted">Last sync</Text>
        <Text variant="body" size="sm" class="text-text">{{ stateLabel }}</Text>
      </Flex>

      <!-- Manual controls -->
      <Flex direction="row" :gap="2" class="flex-wrap">
        <Button variant="primary" :disabled="!canSyncNow" @click="onSyncNow">Sync now</Button>
        <Button variant="secondary" :disabled="!sync.busy" @click="onStop">Stop</Button>
        <Button variant="ghost" :disabled="!sync.busy" @click="onCancel">Cancel</Button>
      </Flex>

      <!-- Toggles -->
      <Flex direction="column" :gap="3">
        <label class="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" :checked="config.syncEnabled" class="accent-accent" @change="toggleSyncEnabled" />
          Enable sync
        </label>
        <Text variant="body" size="xs" class="text-text-muted"
          >When off, notes stay on this device and no sync runs (manual or automatic).</Text
        >

        <label class="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            :checked="config.fullOfflineMode"
            class="accent-accent"
            @change="toggleFullOffline"
          />
          Full offline mode
        </label>
        <Text variant="body" size="xs" class="text-text-muted"
          >Download all notes + attachments for offline access. Increases sync time + storage.</Text
        >
      </Flex>

      <Text v-if="sync.lastError" variant="body" size="xs" class="text-[var(--red-static)]">{{ sync.lastError }}</Text>
    </Flex>
  </Surface>
</template>