import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import { desktop } from "@/platform/desktop-bridge";
import { writeAttachmentBytes } from "@/platform/fs";
import type {
  BackupFile,
  LegacyBackupFile,
  Cipher,
  SerializedKey
} from "@notesnook-vue/contracts";
import {
  collectBackupExport,
  isDataChunkName,
  dataChunkIndex,
  parseManifest,
  MANIFEST_NAME,
  ATTACHMENTS_KEY_NAME,
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

/** Detect an encrypted backup chunk without importing core's `isCipher`: a new-
 *  format chunk carries `encrypted: true`; a legacy encrypted chunk's `data` is
 *  a `Cipher` (has a string `cipher` field). Used to require a restore password. */
function looksEncrypted(chunk: unknown): boolean {
  if (chunk && typeof chunk === "object") {
    const c = chunk as Record<string, unknown>;
    if (c.encrypted === true) return true;
    const data = c.data as Record<string, unknown> | undefined;
    if (data && typeof data === "object" && typeof data.cipher === "string") return true;
  }
  return false;
}

/** Read `<root>/<path>` as bytes, or `undefined` when it doesn't exist (never
 *  throws) — used by restore's pool-first / inline-fallback blob read. */
async function tryReadBytes(root: string, path: string): Promise<Uint8Array | undefined> {
  if (!(await desktop.backupFs.exists.query({ root, path }))) return undefined;
  // tRPC infers `readFileBytes`'s `Uint8Array` output as a structural subset
  // (missing the typed-array methods); cast back to the full type — the value
  // is a real `Uint8Array` over IPC (mirrors `NodeFSFileStore.readChunk`).
  return (await desktop.backupFs.readFileBytes.query({ root, path })) as Uint8Array;
}

/** The attachment hash list to restore from a backup dir: the manifest's hashes
 *  (new layout, `<dir>/attachments/manifest.json`) or, when there is no
 *  manifest, an inline listing of `<dir>/attachments/` (old layout, blobs lived
 *  inside the backup dir) with the key + manifest names filtered out. */
async function restoreHashList(root: string, dir: string): Promise<string[]> {
  const manifestPath = `${dir}/attachments/${MANIFEST_NAME}`;
  if (await desktop.backupFs.exists.query({ root, path: manifestPath })) {
    const text = await desktop.backupFs.readFileText.query({ root, path: manifestPath });
    return parseManifest(text);
  }
  const entries = await desktop.backupFs.listDir.query({ root, path: `${dir}/attachments` });
  return entries.filter((n) => n !== ATTACHMENTS_KEY_NAME && n !== MANIFEST_NAME);
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

  /** Restore a directory-tree full backup (`<sanitized>/full/<stamp>-full/`,
   *  written by the auto-backup scheduler or the manual "Back up now → Full"
   *  flow). `root` is the containing backup directory; `dir` is the
   *  `<sanitized>/full/<stamp>-full` path relative to `root`.
   *
   *  Core's `db.backup.import` restores only the notes/content + attachment
   *  METADATA + per-attachment key + relations (and marks attachments
   *  not-uploaded so sync re-fetches). It does NOT write blobs — so after
   *  importing every data chunk in index order, this method writes each
   *  referenced encrypted blob back into the local chunk store via
   *  `writeAttachmentBytes` so attachments open offline. Blobs are read from
   *  the per-account pool first (`<sanitized>/attachments/<hash>`), falling back
   *  to the inline `<dir>/attachments/<hash>` (old-layout backups). Missing
   *  blobs are tolerated (sync re-fetches). `attachmentsKey` (from
   *  `attachments/.attachments_key`) is passed to import; encrypted backups
   *  require `password` (core decrypts the wrapped attachmentsKey with it). */
  async function restoreFullBackupFromDir(
    root: string,
    dir: string,
    options: { password?: string } = {}
  ): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const db = getDatabase();

      // 1. List the backup dir; identify data chunks in index order.
      const entries = await desktop.backupFs.listDir.query({ root, path: dir });
      const dataChunks = entries
        .filter(isDataChunkName)
        .sort((a, b) => dataChunkIndex(a) - dataChunkIndex(b));
      if (dataChunks.length === 0) {
        lastError.value = "No data chunks found in the selected backup directory.";
        return false;
      }

      // 2. Read `.attachments_key` (absent for a notes-only/partial-style dir).
      let attachmentsKey: SerializedKey | Cipher<"base64"> | undefined;
      try {
        const keyText = await desktop.backupFs.readFileText.query({
          root,
          path: `${dir}/attachments/${ATTACHMENTS_KEY_NAME}`
        });
        const parsed = JSON.parse(keyText) as SerializedKey | Cipher<"base64">;
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
          attachmentsKey = parsed;
        }
      } catch {
        /* no key — attachments won't be re-keyed; blobs still restore if present */
      }

      // 3. Detect an encrypted backup from the first data chunk; require a password.
      const firstText = await desktop.backupFs.readFileText.query({
        root,
        path: `${dir}/${dataChunks[0]}`
      });
      const firstChunk = JSON.parse(firstText) as unknown;
      if (looksEncrypted(firstChunk) && !options.password) {
        lastError.value = "This backup is encrypted — enter a password to restore it.";
        return false;
      }

      // 4. Import every data chunk in index order with conditional opts
      //    (exactOptionalPropertyTypes: only set keys that are present).
      for (const name of dataChunks) {
        const text = await desktop.backupFs.readFileText.query({ root, path: `${dir}/${name}` });
        const chunk = JSON.parse(text) as BackupFile | LegacyBackupFile;
        const importOpts: {
          password?: string;
          encryptionKey?: string;
          attachmentsKey?: SerializedKey | Cipher<"base64">;
        } = {};
        if (options.password) importOpts.password = options.password;
        if (attachmentsKey) importOpts.attachmentsKey = attachmentsKey;
        await db.backup.import(chunk, importOpts);
      }

      // 5. Write each referenced encrypted blob back into the local chunk store.
      //    Hash list: the manifest (new layout) or an inline dir listing (old
      //    layout, no manifest). Each blob: pool first, then inline fallback.
      const sanitized = dir.split("/full/")[0] ?? "";
      const hashes = await restoreHashList(root, dir);
      let wroteBlobs = 0;
      for (const hash of hashes) {
        const bytes =
          (await tryReadBytes(root, `${sanitized}/attachments/${hash}`)) ??
          (await tryReadBytes(root, `${dir}/attachments/${hash}`));
        if (!bytes) continue; // tolerate a missing blob — sync re-fetches
        if (await writeAttachmentBytes(db, hash, bytes)) wroteBlobs++;
      }
      logger.log(`[backups] restore: imported ${dataChunks.length} chunk(s), wrote ${wroteBlobs} of ${hashes.length} attachment blob(s).`);

      await refresh();
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      logger.error("[backups] restoreFullBackupFromDir failed:", e);
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
    importBackup,
    restoreFullBackupFromDir
  };
});