<script setup lang="ts">
/**
 * Backup & Export settings section (Phase 2) — export a backup to a user-
 * chosen `.nnbackup` file, restore one, and the client-only backup toggles.
 *
 * Export: `useBackupsStore.exportBackup` drains `db.backup.export` into file
 * chunks. For the common case (a partial backup under ~10MB — upstream's
 * `MAX_CHUNK_SIZE`) the export is a SINGLE data chunk, which we save directly
 * as a `.nnbackup` (legacy-compatible single-JSON `BackupFile`) via the
 * `desktop.dialog.saveFile` bridge. A larger export yields multiple chunks
 * (a multi-file archive that upstream bundles as `.nnbackupz` zip); we REFUSE
 * that here with a clear message rather than silently writing an incomplete
 * backup — full `.nnbackupz` zip support is a follow-up (needs a direct zip
 * dependency + a streaming bridge).
 *
 * Restore: `desktop.dialog.openFile` reads a `.nnbackup`; we parse + import.
 * `.nnbackupz` (zip) restore is the same follow-up. Encrypted backups need a
 * password (optional field here, passed to `importBackup`).
 *
 * Toggles (`useConfigStore`, localStorage): encrypt backups, automatic-backup
 * reminder (never/daily/weekly/monthly), the with-attachments variant, and the
 * retention count. The reminder offsets + retention drive the per-account
 * auto-backup scheduler (`stores/auto-backup.ts`), which writes each account's
 * backup into its own subdirectory of the configured backup directory.
 */
import { ref, computed, onMounted } from "vue";
import { Surface, Flex, Text, Button, Input } from "@notesnook-vue/ui-vue";
import { useI18n } from "vue-i18n";
import { useBackupsStore } from "@/stores/backup";
import { useAutoBackupStore } from "@/stores/auto-backup";
import { useConfigStore } from "@/stores/config";
import { desktop } from "@/platform/desktop-bridge";
import { formatBackupTime, backupFilename, relativeChild } from "@/utils/backup";
import type { BackupFile, LegacyBackupFile } from "@notesnook-vue/contracts";

const backups = useBackupsStore();
const auto = useAutoBackupStore();
const config = useConfigStore();
const { t } = useI18n();

onMounted(() => {
  // Seed the last-backup timestamp (the settings window doesn't on boot).
  void backups.refresh();
});

const formError = ref<string | null>(null);
const info = ref<string | null>(null);
const error = computed(() => formError.value ?? backups.lastError);
const lastBackupLabel = computed(() => t("settings.backup.lastBackup", { time: formatBackupTime(backups.lastBackup) }));

/** Backup-now format picker ("-" = choose, "partial" / "full"). */
const backupMode = ref<"-" | "partial" | "full">("-");

/** Optional password for restoring an encrypted backup. */
const restorePassword = ref("");

const reminderOptions = computed<{ value: number; label: string }[]>(() => [
  { value: 0, label: t("common.never") },
  { value: 1, label: t("settings.backup.daily") },
  { value: 2, label: t("settings.backup.weekly") },
  { value: 3, label: t("settings.backup.monthly") }
]);

/** Retention-count options (1–10). Mirrors the reminder select shape. */
const retentionOptions = computed<{ value: number; label: string }[]>(() =>
  Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))
);

function pickBackupMode(e: Event): void {
  backupMode.value = (e.target as HTMLSelectElement).value as "-" | "partial" | "full";
}
function pickReminder(e: Event): void {
  const newVal = Number((e.target as HTMLSelectElement).value);
  const wasEnabled = config.backupReminderOffset !== 0;
  config.setBackupReminderOffset(newVal);
  // Just enabled (Never → a schedule): offer to create one immediately.
  if (!wasEnabled && newVal !== 0) void maybeCreateNow("partial");
}
function pickFullReminder(e: Event): void {
  const newVal = Number((e.target as HTMLSelectElement).value);
  const wasEnabled = config.fullBackupReminderOffset !== 0;
  config.setFullBackupReminderOffset(newVal);
  if (!wasEnabled && newVal !== 0) void maybeCreateNow("full");
}
function pickRetention(e: Event): void {
  config.setBackupRetentionCount(Number((e.target as HTMLSelectElement).value));
}
function toggleEncrypt(e: Event): void {
  config.setEncryptBackups((e.target as HTMLInputElement).checked);
}

async function onSelectBackupDirectory(): Promise<void> {
  const dir = await desktop.dialog.selectDirectory.mutate();
  if (dir) {
    config.setBackupDirectory(dir);
    info.value = t("settings.backup.dirSet", { dir });
  }
}

function onClearBackupDirectory(): void {
  config.setBackupDirectory(null);
  info.value = t("settings.backup.dirCleared");
}

/** Export a backup. Partial → a single `.nnbackup` file (user-chosen or in the
 *  backup directory). Full → a dated folder in the backup directory via the
 *  auto-backup writer (dir-tree + dedup pool + rotate + GC), so manual and auto
 *  full backups share one attachment pool per account. Refuses multi-chunk
 *  PARTIAL exports (would need `.nnbackupz` zip) instead of truncating. */
async function onBackupNow(): Promise<void> {
  formError.value = null;
  info.value = null;
  const mode = backupMode.value;
  if (mode === "-") {
    formError.value = t("settings.backup.chooseFormatFirst");
    return;
  }
  if (mode === "full") {
    await onBackupNowFull();
    return;
  }
  await runPartialBackupNow();
}

/** Run a partial (notes-only) backup now: collect the export and save a single
 *  `.nnbackup` data chunk to the backup directory (or a user-chosen file when
 *  none is set). Shared by "Back up now → Partial" and the enable-cadence
 *  "create now?" prompt. Refuses multi-chunk exports (would need `.nnbackupz`). */
async function runPartialBackupNow(): Promise<void> {
  const exportInput: { mode: "partial"; encrypt?: boolean } = { mode: "partial" };
  if (config.encryptBackups) exportInput.encrypt = true;
  const result = await backups.exportBackup(exportInput);
  if (!result) return; // error surfaced via backups.lastError
  // Data chunks = everything except the `.nnbackup` index marker (empty data)
  // and attachment files (partial mode never yields any).
  const dataChunks = result.files.filter(
    (f) => f.path !== ".nnbackup" && !f.path.startsWith("attachments/")
  );
  if (dataChunks.length === 0) {
    formError.value = t("settings.backup.noData");
    return;
  }
  if (dataChunks.length > 1) {
    formError.value = t("settings.backup.tooLarge");
    return;
  }
  let saved = false;
  if (config.backupDirectory) {
    saved = await desktop.dialog.saveFileToDir.mutate({
      dir: config.backupDirectory,
      defaultName: backupFilename("partial"),
      data: dataChunks[0]!.data
    });
  } else {
    saved = await desktop.dialog.saveFile.mutate({
      defaultName: backupFilename("partial"),
      data: dataChunks[0]!.data
    });
  }
  if (!saved) return; // user cancelled
  info.value = t("settings.backup.backupSaved");
}

/** When the user enables an automatic-backup cadence (Never → a schedule),
 *  offer to create a backup of that mode immediately. */
async function maybeCreateNow(mode: "partial" | "full"): Promise<void> {
  formError.value = null;
  const yes = await desktop.dialog.confirm.mutate({
    message: t("settings.backup.createNowPrompt"),
    title: t("settings.backup.createNowTitle")
  });
  if (!yes) return;
  if (mode === "partial") await runPartialBackupNow();
  else await onBackupNowFull();
}

/** Manual "Back up now → Full": requires a backup directory (prompts for one if
 *  unset), then writes the full backup through the shared dir-tree + dedup pool
 *  path. */
async function onBackupNowFull(): Promise<void> {
  let root = config.backupDirectory;
  if (!root) {
    const picked = await desktop.dialog.selectDirectory.mutate();
    if (!picked) return; // user cancelled
    config.setBackupDirectory(picked);
    root = picked;
    info.value = t("settings.backup.dirSet", { dir: picked });
  }
  const res = await auto.backupNowFull(root, config.encryptBackups);
  if (!res.ok) {
    formError.value = res.error || t("settings.backup.noData");
    return;
  }
  await backups.refresh(); // update the "Last backup" display (core stamps on export)
  info.value = t("settings.backup.backupSaved");
}

/** Restore a `.nnbackup` file (legacy single-JSON format). `.nnbackupz` (zip)
 *  is the follow-up. */
async function onRestore(): Promise<void> {
  formError.value = null;
  info.value = null;
  const file = await desktop.dialog.openFile.mutate({ extensions: ["nnbackup", "nnbackupz"] });
  if (!file) return; // user cancelled
  if (file.name.endsWith(".nnbackupz")) {
    formError.value = t("settings.backup.nnbackupzUnsupported");
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.data);
  } catch {
    formError.value = t("settings.backup.invalidBackup");
    return;
  }
  // Build options conditionally (exactOptionalPropertyTypes — see export).
  const importInput: { password?: string } = {};
  if (restorePassword.value) importInput.password = restorePassword.value;
  const ok = await backups.importBackup(parsed as BackupFile | LegacyBackupFile, importInput);
  if (ok) {
    info.value = t("settings.backup.backupRestored");
    // Signal the main window to reload its notes/collections — the import
    // mutated the shared DB in this (settings) renderer, and core events are
    // per-process so the main window's stores won't see it otherwise.
    void desktop.window.notifyDataChanged.mutate().catch(() => {
      /* main unreachable (e.g. tests) — the import still succeeded */
    });
  }
}

/** Restore a directory-tree full backup (the "Backup with attachments" layout):
 *  the user picks the dated `…-full` folder inside the configured backup
 *  directory; the store method imports every data chunk + writes the
 *  referenced attachment blobs back into the local chunk store. */
async function onRestoreFromDir(): Promise<void> {
  formError.value = null;
  info.value = null;
  const root = config.backupDirectory;
  if (!root) {
    formError.value = t("settings.backup.backupFullNeedsDir");
    return;
  }
  const picked = await desktop.dialog.selectDirectory.mutate();
  if (!picked) return; // user cancelled
  const dir = relativeChild(root, picked);
  if (dir === null) {
    formError.value = t("settings.backup.restoreDirOutside");
    return;
  }
  const importInput: { password?: string } = {};
  if (restorePassword.value) importInput.password = restorePassword.value;
  const ok = await backups.restoreFullBackupFromDir(root, dir, importInput);
  if (!ok) return; // error surfaced via backups.lastError
  info.value = t("settings.backup.backupRestored");
  void desktop.window.notifyDataChanged.mutate().catch(() => {
    /* main unreachable (e.g. tests) — the import still succeeded */
  });
}
</script>

<template>
  <Surface class="rounded-xl border border-border p-5">
    <Flex direction="column" :gap="4">
      <Text as="h2" variant="heading" size="md">{{ t("settings.backup.title") }}</Text>
      <Text variant="body" size="xs" class="text-text-muted">{{ lastBackupLabel }}</Text>

      <!-- Backup now -->
      <Flex direction="column" :gap="2">
        <Text variant="body" size="sm" class="text-text">{{ t("settings.backup.backupNow") }}</Text>
        <Flex direction="row" :gap="2" class="flex-wrap items-center">
          <select
            :value="backupMode"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickBackupMode"
          >
            <option value="-">{{ t("settings.backup.chooseFormat") }}</option>
            <option value="partial">{{ t("settings.backup.backupPartial") }}</option>
            <option value="full">{{ t("settings.backup.backupFull") }}</option>
          </select>
          <Button variant="primary" :disabled="backups.busy || auto.busy" @click="onBackupNow">{{
            t("settings.backup.backup")
          }}</Button>
        </Flex>
        <Text variant="body" size="xs" class="text-text-muted"
          >{{ t("settings.backup.backupHint") }}</Text
        >
      </Flex>

      <!-- Restore -->
      <Flex direction="column" :gap="2">
        <Text variant="body" size="sm" class="text-text">{{ t("settings.backup.restoreBackup") }}</Text>
        <Input
          v-model="restorePassword"
          type="password"
          block
          :placeholder="t('settings.backup.restorePasswordPlaceholder')"
          autocomplete="current-password"
        />
        <Button variant="secondary" :disabled="backups.busy" @click="onRestore">{{ t("settings.backup.restore") }}</Button>
        <Text variant="body" size="xs" class="text-text-muted"
          >{{ t("settings.backup.restoreHint") }}</Text
        >
      </Flex>

      <!-- Restore from folder (full backup with attachments) -->
      <Flex direction="column" :gap="2">
        <Button variant="secondary" :disabled="backups.busy" @click="onRestoreFromDir">{{
          t("settings.backup.restoreFromDir")
        }}</Button>
        <Text variant="body" size="xs" class="text-text-muted"
          >{{ t("settings.backup.restoreFromDirHint") }}</Text
        >
      </Flex>

      <!-- Toggles -->
      <Flex direction="column" :gap="3">
        <label class="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" :checked="config.encryptBackups" class="accent-accent" @change="toggleEncrypt" />
          {{ t("settings.backup.encryptBackups") }}
        </label>
        <Text variant="body" size="xs" class="text-text-muted"
          >{{ t("settings.backup.encryptBackupsDesc") }}</Text
        >

        <Flex direction="column" :gap="1">
          <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.backup.autoBackups") }}</Text>
          <select
            :value="config.backupReminderOffset"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickReminder"
          >
            <option v-for="o in reminderOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </Flex>

        <Flex direction="column" :gap="1">
          <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.backup.autoBackupsFull") }}</Text>
          <select
            :value="config.fullBackupReminderOffset"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickFullReminder"
          >
            <option v-for="o in reminderOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </Flex>

        <Flex direction="column" :gap="1">
          <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.backup.retentionCount") }}</Text>
          <select
            :value="config.backupRetentionCount"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickRetention"
          >
            <option v-for="o in retentionOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <Text variant="body" size="xs" class="text-text-muted"
            >{{ t("settings.backup.retentionCountHint") }}</Text
          >
        </Flex>

        <Text variant="body" size="xs" class="text-text-muted"
          >{{ t("settings.backup.autoBackupsAllAccounts") }} {{ t("settings.backup.autoBackupsDormantNote") }}</Text
        >

        <Flex direction="column" :gap="1">
          <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.backup.backupDirectory") }}</Text>
          <Flex direction="row" :gap="2" class="flex-wrap items-center">
            <Input
              :model-value="config.backupDirectory ?? ''"
              readonly
              block
              :placeholder="t('settings.backup.backupDirPlaceholder')"
              class="flex-1"
            />
            <Button variant="secondary" @click="onSelectBackupDirectory">{{ t("settings.backup.chooseDirectory") }}</Button>
            <Button v-if="config.backupDirectory" variant="ghost" @click="onClearBackupDirectory">{{ t("common.clear") }}</Button>
          </Flex>
          <Text variant="body" size="xs" class="text-text-muted"
            >{{ t("settings.backup.backupDirHint") }}</Text
          >
        </Flex>
      </Flex>

      <Text v-if="info" variant="body" size="xs" class="text-[var(--green-static)]">{{ info }}</Text>
      <Text v-if="error" variant="body" size="xs" class="text-[var(--red-static)]">{{ error }}</Text>
    </Flex>
  </Surface>
</template>