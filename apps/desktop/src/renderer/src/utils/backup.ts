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

// --- Auto-backup scheduler helpers (pure) ----------------------------------
//
// These back the per-account automatic backup scheduler (`stores/auto-backup.ts`):
// filename/dir naming, per-account subdirectory sanitization, cadence mapping,
// and the due-check. Pure + side-effect-free so they are unit-testable in
// isolation (mirrors the rest of this module).

/** Build a lexicographically-sortable UTC timestamp stamp
 *  `YYYY-MM-DD-HH-MM-SS`. Used both for the partial `.nnbackup` filename and the
 *  full-mode backup directory name, so sorting directory entries as strings
 *  orders newest-first. Local time would sort wrong across DST; UTC is stable.
 *  `Date` is fine here (this runs in the renderer, not a workflow script). */
export function timestampStamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(
    d.getHours()
  )}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/** Build a dated `.nnbackup` filename, mirroring upstream's naming. `partial`
 *  yields `<stamp>.nnbackup`; `full` yields `<stamp>-full.nnbackup` (the manual
 *  "Back up now" flow still writes a single file for full when it fits). */
export function backupFilename(mode: "partial" | "full"): string {
  return `${timestampStamp()}${mode === "full" ? "-full" : ""}.nnbackup`;
}

/** The directory name for a full-mode auto-backup (a directory tree, not a
 *  single file): `<stamp>-full`. Lexicographically sortable alongside the
 *  partial filenames (same stamp format). */
export function fullBackupDirName(): string {
  return `${timestampStamp()}-full`;
}

/** Windows reserved filenames that must never be a directory segment (a folder
 *  named `CON` is unusable on Windows). Stored lower-case because the input is
 *  lower-cased before the check (Windows matches these case-insensitively).
 *  Prefixed with `_` when encountered. */
const RESERVED_NAMES = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9"
]);

/** Sanitize an account email into a safe, readable per-account subdirectory
 *  name. Lower-cases, keeps `[a-z0-9@.+\-_]`, replaces everything else with `_`,
 *  strips leading/trailing dots/dashes/underscores, clamps to 128 chars, guards
 *  Windows reserved names, and falls back to `"user"` for empty/all-stripped
 *  input. Pure + deterministic so the same email always maps to the same dir. */
export function sanitizeAccountDirName(email: string): string {
  let s = email.toLowerCase();
  s = s.replace(/[^a-z0-9@.+\-_]/g, "_");
  // Strip leading/trailing dots, dashes, underscores (e.g. ".foo." → "foo").
  s = s.replace(/^[\-_.]+|[\-_.]+$/g, "");
  if (s.length > 128) s = s.slice(0, 128).replace(/[\-_.]+$/g, "");
  if (s.length === 0) return "user";
  if (RESERVED_NAMES.has(s)) return `_${s}`;
  return s;
}

/** Map a backup-reminder cadence offset to a millisecond interval, or `null`
 *  when disabled (0 / unknown). Mirrors the `backupReminderOffset` enum: 1 =
 *  daily, 2 = weekly, 3 = monthly. */
export function cadenceToMs(offset: number): number | null {
  const DAY = 24 * 60 * 60 * 1000;
  switch (offset) {
    case 1:
      return DAY;
    case 2:
      return 7 * DAY;
    case 3:
      return 30 * DAY;
    default:
      return null;
  }
}

/** Pure due-check for the scheduler: returns `true` when a backup of the given
 *  cadence is due. `null` cadence → never due (disabled). A missing last-run
 *  (`undefined`) → always due (first run). `now` is injected for testability. */
export function isDue(
  lastRunIso: string | undefined,
  cadenceMs: number | null,
  now: number
): boolean {
  if (cadenceMs === null) return false;
  if (lastRunIso === undefined) return true;
  const lastRun = Date.parse(lastRunIso);
  if (Number.isNaN(lastRun)) return true; // corrupt stamp → re-run + overwrite
  return now - lastRun >= cadenceMs;
}