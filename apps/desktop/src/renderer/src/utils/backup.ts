/**
 * Backup helpers (Phase 6.7) — pure utilities for the backups store. No
 * database import, no side effects → unit-testable in isolation, mirroring
 * `utils/vault.ts` / `utils/properties.ts`.
 *
 * `@notesnook/core`'s `Backup.export` is an `AsyncGenerator` that streams two
 * kinds of chunks: `{type:"file", path, data}` (the backup file pieces — for
 * `type:"node"` a `.nnbackup` index + the JSON-encoded `BackupFile`) and
 * `{type:"attachment", path, hash, total, current}` (attachment-download
 * progress, only in `mode:"full"`). {@link collectBackupExport} drains the
 * generator, collects the file chunks, and reports attachment progress via a
 * callback — so the store can surface progress reactively without holding the
 * generator knowledge itself.
 *
 * `mode:"partial"` (the upstream default) exports notes/content only and works
 * offline; `mode:"full"` includes attachments and requires the user's
 * `attachmentsKey` (auth-gated → on-site after login).
 */

export type BackupPlatform = "web" | "mobile" | "node";

/** Options for a backup export. `type` is fixed to `"node"` for the desktop
 * platform by the store; the util accepts the general shape. */
export interface BackupExportOptions {
  type: BackupPlatform;
  encrypt?: boolean;
  mode?: "full" | "partial";
}

/** A file chunk yielded by `db.backups.export` — a piece of the backup. */
export interface BackupFileChunk {
  path: string;
  data: string;
}

/** Attachment-progress chunk yielded by `db.backups.export` (full mode). */
export interface BackupAttachmentProgress {
  path: string;
  hash: string;
  total: number;
  current: number;
}

/** A chunk yielded by `db.backups.export`. */
export type BackupExportChunk =
  | ({ type: "file" } & BackupFileChunk)
  | ({ type: "attachment" } & BackupAttachmentProgress);

/** Result of draining an export generator: the collected file pieces. */
export interface BackupExportResult {
  files: BackupFileChunk[];
}

/**
 * Drain a `db.backups.export` async generator: collect every `file` chunk and
 * forward `attachment` chunks to `onProgress` (so the store can update a
 * reactive progress ref). Pure with respect to the database — it only touches
 * the passed-in generator. Never throws on generator error: a rejection is
 * re-thrown by the `for await` (the store wraps the call in try/catch).
 */
export async function collectBackupExport(
  gen: AsyncGenerator<BackupExportChunk, void, unknown>,
  onProgress?: (p: BackupAttachmentProgress) => void
): Promise<BackupExportResult> {
  const files: BackupFileChunk[] = [];
  for await (const chunk of gen) {
    if (chunk.type === "file") {
      files.push({ path: chunk.path, data: chunk.data });
    } else if (onProgress) {
      onProgress({
        path: chunk.path,
        hash: chunk.hash,
        total: chunk.total,
        current: chunk.current
      });
    }
  }
  return { files };
}

/** Format a backup timestamp as a relative-ish absolute label for the UI.
 * English; i18n = Phase 7.1. Returns "Never" for a missing timestamp. */
export function formatBackupTime(ts: number | undefined | null): string {
  if (!ts) return "Never";
  return new Date(ts).toLocaleString();
}