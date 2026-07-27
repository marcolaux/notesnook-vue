import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import type {
  BackupFile,
  LegacyBackupFile,
  Cipher,
  SerializedKey
} from "@notesnook-vue/contracts";
import {
  collectBackupExport,
  type BackupAttachmentProgress,
  type BackupExportResult
} from "@/utils/backup";
import { logger } from "@/utils/logger";

/**
 * Backups store (Phase 6.7 — headless data backend) — the reactive surface
 * for `@notesnook/core`'s `Backup` API (`db.backup`): export a backup
 * (streaming), import a backup, and track the last-backup time. Backs the
 * future Backup/Restore UI (on-site).
 *
 * Design (mirrors `stores/vault.ts` / `stores/trash.ts`):
 *  - **Never throws.** Every action catches, sets `lastError`, logs, and
 *    leaves prior state intact. `exportBackup` returns the collected file
 *    pieces (or `undefined` on failure); `importBackup` returns boolean.
 *  - **Streaming export.** `db.backup.export` is an `AsyncGenerator`; the
 *    pure {@link collectBackupExport} helper drains it, collecting file chunks
 *    and forwarding attachment progress to the `progress` ref so a future UI
 *    can show a progress bar (full mode only). The store holds no generator
 *    knowledge — that lives in the util.
 *  - **Offline-safe default.** `mode:"partial"` (upstream default) exports
 *    notes/content only and works without login. `mode:"full"` includes
 *    attachments and requires the user's `attachmentsKey` (auth-gated →
 *    on-site after login); passing `mode:"full"` unauthenticated will fail and
 *    surface as `lastError`.
 *
 * Writing the exported file pieces to disk (FileStorage) is an on-site platform
 * concern — the store returns the data, the view persists it.
 */

export interface BackupExportInput {
  encrypt?: boolean;
  mode?: "full" | "partial";
}

export interface BackupImportInput {
  password?: string;
  encryptionKey?: string;
  attachmentsKey?: SerializedKey | Cipher<"base64">;
}

export const useBackupsStore = defineStore("backups", () => {
  const lastBackup = ref<number | undefined>(undefined);
  const busy = ref(false);
  const progress = ref<BackupAttachmentProgress | null>(null);
  const lastError = ref<string | null>(null);

  const hasBackup = computed(() => lastBackup.value !== undefined);

  function clearError(): void {
    lastError.value = null;
  }

  /** Read the last-backup timestamp from the database. Never throws — a
   * failure leaves the previous value intact. */
  async function refresh(): Promise<void> {
    try {
      const db = getDatabase();
      lastBackup.value = await db.backup.lastBackupTime();
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[backups] refresh failed:", e);
    }
  }

  /** Export a backup (streaming). `type` is fixed to `"node"` for the desktop
   * platform. Collects the file pieces yielded by `db.backup.export` and
   * tracks attachment progress (full mode). On success stamps the backup time
   * + refreshes. Returns the collected file pieces, or `undefined` on failure.
   * The view writes the pieces to disk (on-site). */
  async function exportBackup(
    input: BackupExportInput = {}
  ): Promise<BackupExportResult | undefined> {
    clearError();
    busy.value = true;
    progress.value = null;
    try {
      const db = getDatabase();
      // Build options conditionally — `exactOptionalPropertyTypes` rejects an
      // explicit `undefined` for an optional prop, so only set keys that exist.
      const exportOpts: {
        type: "node";
        encrypt?: boolean;
        mode?: "full" | "partial";
      } = { type: "node" };
      if (input.encrypt !== undefined) exportOpts.encrypt = input.encrypt;
      if (input.mode !== undefined) exportOpts.mode = input.mode;
      const result = await collectBackupExport(
        db.backup.export(exportOpts),
        (p) => {
          progress.value = p;
        }
      );
      await db.backup.updateBackupTime();
      await refresh();
      return result;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      logger.error("[backups] export failed:", e);
      return undefined;
    } finally {
      busy.value = false;
      progress.value = null;
    }
  }

  /** Import a backup file. `backup` is a parsed `BackupFile` / legacy file.
   * Returns `true` on success, `false` on failure (error set). Never throws. */
  async function importBackup(
    backup: BackupFile | LegacyBackupFile,
    options: BackupImportInput = {}
  ): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const db = getDatabase();
      // Build options conditionally (exactOptionalPropertyTypes — see export).
      const importOpts: {
        password?: string;
        encryptionKey?: string;
        attachmentsKey?: SerializedKey | Cipher<"base64">;
      } = {};
      if (options.password !== undefined) importOpts.password = options.password;
      if (options.encryptionKey !== undefined)
        importOpts.encryptionKey = options.encryptionKey;
      if (options.attachmentsKey !== undefined)
        importOpts.attachmentsKey = options.attachmentsKey;
      await db.backup.import(backup, importOpts);
      await refresh();
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      logger.error("[backups] import failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  return {
    lastBackup,
    busy,
    progress,
    lastError,
    hasBackup,
    refresh,
    exportBackup,
    importBackup
  };
});