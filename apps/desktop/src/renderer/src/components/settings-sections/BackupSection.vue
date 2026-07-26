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
 * reminder (never/daily/weekly/monthly), and the with-attachments variant. The
 * reminder offsets drive the auto-backup scheduler (a later phase — stored now,
 * wired then).
 */
import { ref, computed, onMounted } from "vue";
import { Surface, Flex, Text, Button, Input } from "@notesnook-vue/ui-vue";
import { useBackupsStore } from "@/stores/backup";
import { useConfigStore } from "@/stores/config";
import { desktop } from "@/platform/desktop-bridge";
import { formatBackupTime } from "@/utils/backup";
import type { BackupFile, LegacyBackupFile } from "@notesnook-vue/contracts";

const backups = useBackupsStore();
const config = useConfigStore();

onMounted(() => {
  // Seed the last-backup timestamp (the settings window doesn't on boot).
  void backups.refresh();
});

const formError = ref<string | null>(null);
const info = ref<string | null>(null);
const error = computed(() => formError.value ?? backups.lastError);
const lastBackupLabel = computed(() => `Last backup: ${formatBackupTime(backups.lastBackup)}`);

/** Backup-now format picker ("-" = choose, "partial" / "full"). */
const backupMode = ref<"-" | "partial" | "full">("-");

/** Optional password for restoring an encrypted backup. */
const restorePassword = ref("");

const reminderOptions: { value: number; label: string }[] = [
  { value: 0, label: "Never" },
  { value: 1, label: "Daily" },
  { value: 2, label: "Weekly" },
  { value: 3, label: "Monthly" }
];

function pickBackupMode(e: Event): void {
  backupMode.value = (e.target as HTMLSelectElement).value as "-" | "partial" | "full";
}
function pickReminder(e: Event): void {
  config.setBackupReminderOffset(Number((e.target as HTMLSelectElement).value));
}
function pickFullReminder(e: Event): void {
  config.setFullBackupReminderOffset(Number((e.target as HTMLSelectElement).value));
}
function toggleEncrypt(e: Event): void {
  config.setEncryptBackups((e.target as HTMLInputElement).checked);
}

/** Build a dated `.nnbackup` filename, mirroring upstream's naming. */
function backupFilename(mode: "partial" | "full"): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(
    d.getHours()
  )}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return `${stamp}${mode === "full" ? "-full" : ""}.nnbackup`;
}

async function onSelectBackupDirectory(): Promise<void> {
  const dir = await desktop.dialog.selectDirectory.mutate();
  if (dir) {
    config.setBackupDirectory(dir);
    info.value = `Backup directory set to: ${dir}`;
  }
}

function onClearBackupDirectory(): void {
  config.setBackupDirectory(null);
  info.value = "Backup directory cleared.";
}

/** Export a backup and save it to a user-chosen `.nnbackup` file (or configured backup directory). Refuses
 *  multi-chunk exports (would need `.nnbackupz` zip) instead of truncating. */
async function onBackupNow(): Promise<void> {
  formError.value = null;
  info.value = null;
  const mode = backupMode.value;
  if (mode === "-") {
    formError.value = "Choose a backup format first.";
    return;
  }
  // Build options conditionally — `exactOptionalPropertyTypes` rejects an
  // explicit `undefined` for an optional prop (TS2379), so only set `encrypt`
  // when the toggle is on.
  const exportInput: { mode: "partial" | "full"; encrypt?: boolean } = { mode };
  if (config.encryptBackups) exportInput.encrypt = true;
  const result = await backups.exportBackup(exportInput);
  if (!result) return; // error surfaced via backups.lastError
  // Data chunks = everything except the `.nnbackup` index marker (empty data)
  // and attachment files (only present in full mode; handled separately).
  const dataChunks = result.files.filter(
    (f) => f.path !== ".nnbackup" && !f.path.startsWith("attachments/")
  );
  if (dataChunks.length === 0) {
    formError.value = "Backup produced no data.";
    return;
  }
  if (dataChunks.length > 1) {
    formError.value =
      "This backup is too large for the single-file format (>10MB). Multi-file .nnbackupz support is coming; export a smaller range or wait for the zip format.";
    return;
  }
  let saved = false;
  if (config.backupDirectory) {
    saved = await desktop.dialog.saveFileToDir.mutate({
      dir: config.backupDirectory,
      defaultName: backupFilename(mode),
      data: dataChunks[0]!.data
    });
  } else {
    saved = await desktop.dialog.saveFile.mutate({
      defaultName: backupFilename(mode),
      data: dataChunks[0]!.data
    });
  }
  if (!saved) return; // user cancelled
  info.value = "Backup saved.";
}

/** Restore a `.nnbackup` file (legacy single-JSON format). `.nnbackupz` (zip)
 *  is the follow-up. */
async function onRestore(): Promise<void> {
  formError.value = null;
  info.value = null;
  const file = await desktop.dialog.openFile.mutate({ extensions: ["nnbackup", "nnbackupz"] });
  if (!file) return; // user cancelled
  if (file.name.endsWith(".nnbackupz")) {
    formError.value = "Restoring .nnbackupz (zip) backups is not supported yet.";
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.data);
  } catch {
    formError.value = "That file is not a valid backup.";
    return;
  }
  // Build options conditionally (exactOptionalPropertyTypes — see export).
  const importInput: { password?: string } = {};
  if (restorePassword.value) importInput.password = restorePassword.value;
  const ok = await backups.importBackup(parsed as BackupFile | LegacyBackupFile, importInput);
  if (ok) {
    info.value = "Backup restored.";
    // Signal the main window to reload its notes/collections — the import
    // mutated the shared DB in this (settings) renderer, and core events are
    // per-process so the main window's stores won't see it otherwise.
    void desktop.window.notifyDataChanged.mutate().catch(() => {
      /* main unreachable (e.g. tests) — the import still succeeded */
    });
  }
}
</script>

<template>
  <Surface class="rounded-xl border border-border p-5">
    <Flex direction="column" :gap="4">
      <Text as="h2" variant="heading" size="md">Backup &amp; Export</Text>
      <Text variant="body" size="xs" class="text-text-muted">{{ lastBackupLabel }}</Text>

      <!-- Backup now -->
      <Flex direction="column" :gap="2">
        <Text variant="body" size="sm" class="text-text">Backup now</Text>
        <Flex direction="row" :gap="2" class="flex-wrap items-center">
          <select
            :value="backupMode"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickBackupMode"
          >
            <option value="-">Choose format</option>
            <option value="partial">Backup (notes only)</option>
            <option value="full">Backup with attachments</option>
          </select>
          <Button variant="primary" :disabled="backups.busy" @click="onBackupNow">Backup</Button>
        </Flex>
        <Text variant="body" size="xs" class="text-text-muted"
          >Saves a `.nnbackup` file to a location you choose. "Backup with attachments" requires login.</Text
        >
      </Flex>

      <!-- Restore -->
      <Flex direction="column" :gap="2">
        <Text variant="body" size="sm" class="text-text">Restore backup</Text>
        <Input
          v-model="restorePassword"
          type="password"
          block
          placeholder="Password (optional — for encrypted backups)"
          autocomplete="current-password"
        />
        <Button variant="secondary" :disabled="backups.busy" @click="onRestore">Restore</Button>
        <Text variant="body" size="xs" class="text-text-muted"
          >Imports a `.nnbackup` file. `.nnbackupz` (zip) restore is coming.</Text
        >
      </Flex>

      <!-- Toggles -->
      <Flex direction="column" :gap="3">
        <label class="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" :checked="config.encryptBackups" class="accent-accent" @change="toggleEncrypt" />
          Encrypt backups
        </label>
        <Text variant="body" size="xs" class="text-text-muted"
          >Encrypted backups require login (they use your account key).</Text
        >

        <Flex direction="column" :gap="1">
          <Text variant="body" size="sm" class="text-text-muted">Automatic backups</Text>
          <select
            :value="config.backupReminderOffset"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickReminder"
          >
            <option v-for="o in reminderOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </Flex>

        <Flex direction="column" :gap="1">
          <Text variant="body" size="sm" class="text-text-muted">Automatic backups with attachments</Text>
          <select
            :value="config.fullBackupReminderOffset"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickFullReminder"
          >
            <option v-for="o in reminderOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </Flex>

        <Flex direction="column" :gap="1">
          <Text variant="body" size="sm" class="text-text-muted">Backup directory</Text>
          <Flex direction="row" :gap="2" class="flex-wrap items-center">
            <Input
              :model-value="config.backupDirectory ?? ''"
              readonly
              block
              placeholder="Not set (prompts for location on backup)"
              class="flex-1"
            />
            <Button variant="secondary" @click="onSelectBackupDirectory">Choose directory</Button>
            <Button v-if="config.backupDirectory" variant="ghost" @click="onClearBackupDirectory">Clear</Button>
          </Flex>
          <Text variant="body" size="xs" class="text-text-muted"
            >Select a directory to store automatic and manual backups without prompting.</Text
          >
        </Flex>
      </Flex>

      <Text v-if="info" variant="body" size="xs" class="text-[var(--green-static)]">{{ info }}</Text>
      <Text v-if="error" variant="body" size="xs" class="text-[var(--red-static)]">{{ error }}</Text>
    </Flex>
  </Surface>
</template>