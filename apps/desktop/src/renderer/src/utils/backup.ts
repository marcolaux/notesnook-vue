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

/** Resolve `abs` to a path relative to `root` (with `/` separators), or `null`
 *  when `abs` is not inside `root` (or is `root` itself). Pure string ops — the
 *  renderer has no node `path`. Used to turn a user-picked backup folder into
 *  the `dir` arg the restore store method expects (relative to the configured
 *  backup directory). OS separators are normalised to `/` first: `selectDirectory`
 *  returns native paths (`C:\…\Backups` on Windows) and `config.backupDirectory`
 *  stores them as-is, so a raw `startsWith(r + "/")` would mis-compare backslashes
 *  on Windows and wrongly reject a valid child. The main-process `safeChild` uses
 *  `resolve` (separator-agnostic); this guard must match. */
export function relativeChild(root: string, abs: string): string | null {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const r = norm(root);
  const a = norm(abs);
  if (!a || a === r) return null;
  if (a.startsWith(r + "/")) return a.slice(r.length + 1);
  return null;
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

// --- Dedup pool + restore helpers (pure) -----------------------------------
//
// Back the content-addressed attachment pool (`stores/auto-backup.ts`) and the
// directory-tree restore (`stores/backup.ts`). Attachment blobs live once in a
// per-account pool `<sanitized>/attachments/<hash>`; each full backup writes a
// `manifest.json` listing the hashes it references (only the blobs actually
// written — see the scheduler). GC keeps pool blobs referenced by any retained
// full backup's manifest. Pure + side-effect-free so they are unit-testable in
// isolation (mirrors the rest of this module).

/** Filename of the per-backup attachment manifest (relative to the backup dir's
 *  `attachments/` subdir). */
export const MANIFEST_NAME = "manifest.json";
/** Filename of the per-backup attachments key (relative to the backup dir's
 *  `attachments/` subdir; yielded by core during a full export). */
export const ATTACHMENTS_KEY_NAME = ".attachments_key";
/** The per-account pool directory name: `<sanitized>/attachments/` holds the
 *  shared, write-once encrypted blobs. (Also the subdir name inside each
 *  `<stamp>-full/` dir that holds `.attachments_key` + `manifest.json`.) */
export const POOL_DIR = "attachments";

/** Build the manifest body for a set of attachment hashes (the blobs this backup
 *  references in the pool). The scheduler writes the manifest BEFORE the blobs and
 *  lists every hash core yielded progress for (the intended set), so a concurrent
 *  GC pass sees the references before any blob exists and never sweeps a blob the
 *  backup is about to claim. A listed hash that turns out uncached (no local
 *  stream → never written to the pool) is harmless: restore tolerates a missing
 *  blob (sync re-fetches), and GC only deletes pool blobs. */
export function buildManifest(hashes: string[]): string {
  return JSON.stringify({ hashes });
}

/** Parse a manifest body into its hash list. Tolerant: any parse/shape failure
 *  (garbage, empty, missing `hashes`, non-array) returns `[]` so a corrupt or
 *  old-layout backup (no manifest) contributes no references rather than
 *  throwing. */
export function parseManifest(text: string): string[] {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).hashes)) {
      return (parsed as any).hashes.filter((h: unknown): h is string => typeof h === "string");
    }
    return [];
  } catch {
    return [];
  }
}

/** Regex for a core data-chunk filename: `<chunkIndex>-<plain|encrypted>-<md5>`.
 *  The `.nnbackup` marker, `attachments/.attachments_key`, and `manifest.json`
 *  do NOT match (they are not data chunks). */
export const DATA_CHUNK_RE = /^(\d+)-(plain|encrypted)-.+$/;

/** Whether a backup-dir entry name is a data chunk (a `BackupFile` piece to
 *  import on restore), as opposed to the marker / key / manifest. */
export function isDataChunkName(name: string): boolean {
  return DATA_CHUNK_RE.test(name);
}

/** The numeric chunk index of a data-chunk filename (for sort-before-import).
 *  Only meaningful when {@link isDataChunkName} is true; returns `NaN` otherwise. */
export function dataChunkIndex(name: string): number {
  return Number(name.slice(0, name.indexOf("-")));
}

/** Union of all hashes referenced across a set of manifest bodies (the GC
 *  mark set). Empty/garbage manifests contribute nothing (see
 *  {@link parseManifest}). */
export function referencedHashes(manifests: string[]): Set<string> {
  const set = new Set<string>();
  for (const m of manifests) for (const h of parseManifest(m)) set.add(h);
  return set;
}

/** Pure GC plan: given the pool's current blob hashes and the manifest bodies of
 *  every retained full backup, split the pool into `keep` (referenced by at
 *  least one retained manifest) and `remove` (unreferenced → safe to delete).
 *  `remove` is named `remove` (not `delete`) to avoid the reserved-word footgun
 *  at the call site. Old-layout backups (no manifest) contribute no references,
 *  so their inline blobs — which live inside the rotated `<stamp>-full/` dir, not
 *  the pool — are unaffected; only pool blobs ever appear here. */
export function gcPlan(
  poolHashes: string[],
  retainedManifests: string[]
): { keep: string[]; remove: string[] } {
  const referenced = referencedHashes(retainedManifests);
  const keep: string[] = [];
  const remove: string[] = [];
  for (const h of poolHashes) {
    if (referenced.has(h)) keep.push(h);
    else remove.push(h);
  }
  return { keep, remove };
}

/** Translation function shape used by {@link buildBackupNotificationBody} so it
 *  stays pure + unit-testable (the store passes the bound `i18n.global.t`). */
export type TranslateFn = (key: string, named?: Record<string, unknown>) => string;

/** Build the BODY of the "automatic backup created" desktop notification (the
 *  title is a constant key). Pure: takes a `t` so it can be tested with a fake.
 *  Partial → notes-only line; full → attachments-included line, with a
 *  "skipped (not cached)" suffix when any attachments were uncached. */
export function buildBackupNotificationBody(
  mode: "partial" | "full",
  fullCounts: { referenced: number; uncached: number } | undefined,
  t: TranslateFn
): string {
  if (mode === "partial") return t("settings.backup.notifyBodyPartial");
  const referenced = fullCounts?.referenced ?? 0;
  let body = t("settings.backup.notifyBodyFull", { n: referenced });
  const uncached = fullCounts?.uncached ?? 0;
  if (uncached > 0) {
    body += " " + t("settings.backup.notifyBodySkipped", { n: uncached });
  }
  return body;
}