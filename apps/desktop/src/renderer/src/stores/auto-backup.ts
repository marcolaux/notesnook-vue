import { defineStore } from "pinia";
import { ref } from "vue";
import { desktop } from "@/platform/desktop-bridge";
import { useConfigStore } from "@/stores/config";
import {
  getDatabase,
  getCurrentContext,
  resolveHostsForContext
} from "@/platform/bootstrap";
import { createDesktopPlatform, initDatabase } from "@/platform/database";
import { ensureLocalUser } from "@/platform/local-user";
import { listAccounts, getAccount } from "@/platform/account-registry";
import { LOCAL_CONTEXT, isLocal, type ContextId } from "@/platform/account-context";
import { readAttachmentStream } from "@/platform/fs";
import {
  collectBackupExport,
  backupFilename,
  fullBackupDirName,
  sanitizeAccountDirName,
  cadenceToMs,
  isDue,
  buildManifest,
  buildBackupNotificationBody,
  MANIFEST_NAME,
  POOL_DIR,
  gcPlan,
  type BackupAttachmentProgress,
  type BackupFileChunk
} from "@/utils/backup";
import type { Database } from "@notesnook-vue/contracts";
import { logger } from "@/utils/logger";
import i18n from "@/i18n";

/**
 * Auto-backup scheduler store — the per-account automatic backup that runs in
 * the main window. Enumerates EVERY context (Local + all logged-in accounts) on
 * a tick and writes each account's backup into its own subdirectory of the
 * shared `backupDirectory`, honoring both cadences (partial = notes/content;
 * full = with attachments), the `encryptBackups` toggle, and rotating to keep
 * the last `backupRetentionCount` per account per mode.
 *
 * Design (mirrors `stores/updater.ts` + `stores/upstream-notifier.ts`):
 *  - **Main window only.** `init()` is gated `!isTornOffWindow &&
 *    !isSettingsWindow && !isChangelogWindow` in `App.vue`. Timers die when the
 *    main window closes (no backups fire while windowless — matches updater/
 *    notifier/reminders); `init()` re-arms on the next boot.
 *  - **Per-context isolation.** A failure backing up one account never aborts
 *    the tick or skips the next account — each context is wrapped in try/catch.
 *  - **`inFlight` guard.** A tick already running short-circuits the next
 *    (timers + manual `tick()`). `initialized` guards reload re-entry.
 *  - **No teardown.** Non-active contexts use a throwaway `Database`
 *    (`openAccountDb`, the same factory pair `ImportSection.vue` uses) — no
 *    `bindEventBridge`, no live-swap. Core has no `Database.close`, so the ref
 *    is simply dropped (GC). The active context reuses the singleton
 *    `getDatabase()` (its `lockingMode: "exclusive"` would contend if re-opened).
 *  - **Dual-cadence stamps.** Core's `db.backup.lastBackupTime` is a single
 *    per-context KV updated by both modes — can't distinguish last-partial from
 *    last-full. So the scheduler keeps its OWN per-context per-mode last-run
 *    timestamps in localStorage for gating; core's stamp still fires for the
 *    Settings "Last backup" display.
 *  - **Full mode = directory tree + dedup pool.** A full backup is laid down as
 *    `<sanitized>/full/<stamp>-full/` containing the `.nnbackup` marker, the data
 *    chunks at their `chunk.path`, `attachments/.attachments_key`, and
 *    `attachments/manifest.json` (the hashes this backup references). The cached
 *    attachment blobs themselves live ONCE in a per-account pool
 *    `<sanitized>/attachments/<hash>` (raw ENCRYPTED bytes via `readAttachmentStream`
 *    — NOT decrypted); a blob already in the pool is skipped, so an unchanged
 *    attachment costs zero I/O on later backups. Dormant accounts (expired token)
 *    back up notes + only their LOCALLY-CACHED attachments; uncached ones are
 *    skipped silently by core (no progress chunk yielded) and omitted from the
 *    manifest. GC (`gcAttachments`) reclaims pool blobs no retained full backup
 *    references.
 *  - **Partial = single `.nnbackup`.** Mirrors the manual "Back up now" flow:
 *    the data chunks (minus the `.nnbackup` marker) collapse into one
 *    `<stamp>.nnbackup` file. A partial export >10MB (multi-chunk) is the
 *    `.nnbackupz` case (out of scope) — we write the first chunk + warn rather
 *    than silently truncating restore; the common account fits in one chunk.
 *  - **Rotate after write+stamp.** `keep >= 1` (clamped in the config setter) so
 *    rotation never deletes the just-written backup.
 *
 * Never throws at the top level — every tick wraps the whole fan-out; per-
 * context + per-mode errors are logged and skipped.
 */

let initialized = false;
let inFlight = false;
let tickTimer: ReturnType<typeof setTimeout> | undefined;
let tickInterval: ReturnType<typeof setInterval> | undefined;

/** Delay before the first tick after boot (let the main window settle — notes
 *  load, sync, etc. — before opening throwaway account DBs). */
const INITIAL_DELAY_MS = 60_000;
/** Re-check interval: how often to re-evaluate which accounts are due. A tick
 *  is cheap when nothing is due (cadence gating short-circuits before any DB
 *  work). */
const RECHECK_INTERVAL_MS = 15 * 60 * 1000;

/** localStorage key prefix for the per-context per-mode last-run stamp. The
 *  full key is `notesnook.autobackup.<contextId>.<partial|full>` and the value
 *  is an ISO string. */
const STAMP_PREFIX = "notesnook.autobackup.";

function readStamp(ctx: string, mode: "partial" | "full"): string | undefined {
  try {
    return localStorage.getItem(STAMP_PREFIX + ctx + "." + mode) ?? undefined;
  } catch {
    return undefined;
  }
}
function writeStamp(ctx: string, mode: "partial" | "full"): void {
  try {
    localStorage.setItem(STAMP_PREFIX + ctx + "." + mode, new Date().toISOString());
  } catch {
    /* best-effort — persistence is optional */
  }
}

/** Open a throwaway account-scoped `Database` for `ctx` WITHOUT assigning the
 *  singleton (the ImportSection.vue pattern). No event bridge, no live-swap, no
 *  teardown. Local is bootstrapped with `ensureLocalUser`; accounts already hold
 *  their cached User + master key from login. */
async function openAccountDb(ctx: ContextId): Promise<Database> {
  const hosts = await resolveHostsForContext(ctx);
  const platform = await createDesktopPlatform(ctx);
  const db = await initDatabase(platform, hosts);
  if (isLocal(ctx)) await ensureLocalUser(db);
  return db;
}

/** Drain a `ReadableStream<Uint8Array>` into a single `Uint8Array` (buffered in
 *  renderer memory). Used to copy a cached attachment's encrypted bytes to disk
 *  in one `writeFileBytes` call. Documented memory bound: the whole encrypted
 *  blob per attachment — fine for typical images; a streaming `appendFileBytes`
 *  IPC is a follow-up if large attachments prove problematic. */
async function drainStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) parts.push(value);
  }
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** The directory-entry regex for a mode's backup names (lexicographically
 *  sortable). Partial = `<stamp>.nnbackup` files; full = `<stamp>-full` dirs. */
const PARTIAL_NAME_RE = /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.nnbackup$/;
const FULL_NAME_RE = /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-full$/;

/** Write a full backup as a directory tree `<sanitized>/full/<stamp>-full/`
 *  referencing the per-account attachment POOL `<sanitized>/attachments/<hash>`.
 *  The tree holds the `.nnbackup` marker, the data chunks at their `chunk.path`,
 *  `attachments/.attachments_key`, and `attachments/manifest.json` (every hash
 *  this backup references). The manifest is written BEFORE the blobs: each cached
 *  attachment's encrypted blob is then written to the pool ONCE — skip if already
 *  present (dedup: an unchanged attachment has the same hash, so a later backup
 *  writes zero bytes for it). Uncached attachments (no local stream) are skipped
 *  + counted; they stay listed in the manifest but are absent from the pool
 *  (restore tolerates a missing blob — sync re-fetches). Writing the manifest
 *  first anchors the GC reference set before any blob exists, so a concurrent GC
 *  pass (another process's tick / a manual full) can't sweep a blob this backup
 *  is about to claim — the pool + GC are shared on disk across renderer processes.
 *
 *  Module-level + exported so the manual "Back up now → Full" flow
 *  (`BackupSection.vue`) reuses the exact same writer + pool as the scheduler —
 *  manual and auto full backups dedup against one shared pool per account. */
export async function writeFullBackupTree(
  root: string,
  sanitized: string,
  files: BackupFileChunk[],
  attachmentProgress: BackupAttachmentProgress[]
): Promise<{
  dirName: string;
  writtenHashes: string[];
  referenced: number;
  uncached: number;
  total: number | undefined;
}> {
  const dirName = fullBackupDirName();
  const base = `${sanitized}/full/${dirName}`;
  await desktop.backupFs.ensureDir.mutate({ root, path: base });
  await desktop.backupFs.ensureDir.mutate({ root, path: `${base}/attachments` });
  await desktop.backupFs.ensureDir.mutate({ root, path: `${sanitized}/${POOL_DIR}` });

  // Write every file chunk at its own `chunk.path` (the marker, the data chunks,
  // and `attachments/.attachments_key`). Ensure each parent dir exists. Attachment
  // BLOBS are not file chunks (core yields them as `type:"attachment"` progress),
  // so the only `attachments/` file chunk here is `.attachments_key`.
  for (const f of files) {
    const slash = f.path.lastIndexOf("/");
    if (slash >= 0) {
      await desktop.backupFs.ensureDir.mutate({ root, path: `${base}/${f.path.slice(0, slash)}` });
    }
    await desktop.backupFs.writeFileText.mutate({ root, path: `${base}/${f.path}`, data: f.data });
  }

  // Manifest FIRST — BEFORE any blob lands in the pool. It lists every hash this
  // backup references (every attachment core yielded progress for), so a
  // concurrent GC pass sees these references before the blobs exist and never
  // sweeps a blob this backup is about to claim. The pool + GC are shared on disk
  // across renderer processes (the auto-tick runs in the main window; the manual
  // "Back up now → Full" runs in the Settings window), so a per-process lock
  // wouldn't reach across them — anchoring the manifest first does. Listing a
  // hash that turns out uncached (no local stream → never written to the pool) is
  // harmless: restore tolerates a missing blob (sync re-fetches), and GC only
  // deletes pool blobs, so an absent hash contributes nothing.
  const intendedHashes = Array.from(new Set(attachmentProgress.map((p) => p.hash)));
  await desktop.backupFs.writeFileText.mutate({
    root,
    path: `${base}/attachments/${MANIFEST_NAME}`,
    data: buildManifest(intendedHashes)
  });

  // Copy each cached attachment's raw encrypted bytes into the per-account pool.
  // Write-once: skip if the blob is already present (dedup). Uncached attachments
  // (no local stream) are skipped + counted (they're listed in the manifest above
  // but absent from the pool — restore skips them, sync re-fetches).
  let referenced = 0;
  let newlyWritten = 0;
  let uncached = 0;
  const writtenHashes: string[] = [];
  for (const p of attachmentProgress) {
    const poolPath = `${sanitized}/${POOL_DIR}/${p.hash}`;
    if (await desktop.backupFs.exists.query({ root, path: poolPath })) {
      referenced++;
      writtenHashes.push(p.hash);
      continue;
    }
    const stream = await readAttachmentStream(p.hash);
    if (!stream) {
      uncached++;
      continue;
    }
    const bytes = await drainStream(stream);
    await desktop.backupFs.writeFileBytes.mutate({ root, path: poolPath, data: bytes });
    newlyWritten++;
    referenced++;
    writtenHashes.push(p.hash);
  }

  const total = attachmentProgress[0]?.total;
  // `total` (from core) counts ALL attachments; uncached ones core skipped never
  // appear in `attachmentProgress`, so uncached = total - referenced - uncached
  // (here) when total is known.
  if (total !== undefined) {
    const coreSkipped = Math.max(0, total - referenced - uncached);
    logger.log(
      `[auto-backup] ${sanitized}/full/${dirName}: referenced ${referenced} attachment(s) (newly written ${newlyWritten}), no local stream ${uncached}, uncached-by-core ${coreSkipped} of ${total}.`
    );
  } else {
    logger.log(
      `[auto-backup] ${sanitized}/full/${dirName}: referenced ${referenced} attachment(s) (newly written ${newlyWritten}), no local stream ${uncached}.`
    );
  }
  return { dirName, writtenHashes, referenced, uncached, total };
}

/** List the retained full-backup directory names for an account (newest first):
 *  the newest `keep` entries under `<sanitized>/full/` matching the full-backup
 *  name regex. Same windowing as `rotate` (sort lexicographically → newest first →
 *  slice `keep`), so GC only considers blobs referenced by backups that still
 *  exist on disk. */
export async function retainedFullDirs(
  root: string,
  sanitized: string,
  keep: number
): Promise<string[]> {
  const entries = await desktop.backupFs.listDir.query({ root, path: `${sanitized}/full` });
  const matches = entries.filter((e) => FULL_NAME_RE.test(e));
  matches.sort(); // ascending = oldest first
  matches.reverse(); // newest first
  return matches.slice(0, Math.max(0, keep));
}

/** Garbage-collect the per-account attachment pool: delete pool blobs not
 *  referenced by any retained full backup's manifest. Mark-and-sweep, run AFTER
 *  `rotate(...,"full")` so the just-written manifest is always in the retained
 *  set (its blobs are never swept). Old-layout backups (no manifest) contribute
 *  no references; their inline blobs live inside the rotated `<stamp>-full/` dir
 *  and are deleted with it by `rotate`, so GC only ever touches the new pool.
 *  Best-effort: a missing manifest or a concurrent delete is tolerated. */
export async function gcAttachments(root: string, sanitized: string): Promise<void> {
  const config = useConfigStore();
  const keep = Math.max(1, config.backupRetentionCount);
  const poolDir = `${sanitized}/${POOL_DIR}`;
  const poolHashes = await desktop.backupFs.listDir.query({ root, path: poolDir });
  if (poolHashes.length === 0) return; // no pool yet (or first full backup)

  const dirs = await retainedFullDirs(root, sanitized, keep);
  const manifests: string[] = [];
  for (const d of dirs) {
    try {
      manifests.push(
        await desktop.backupFs.readFileText.query({
          root,
          path: `${sanitized}/full/${d}/attachments/${MANIFEST_NAME}`
        })
      );
    } catch {
      // Old-layout backup (no manifest) → contributes no references. Its inline
      // blobs are removed with the dir by `rotate`, not by GC.
    }
  }

  const { remove } = gcPlan(poolHashes, manifests);
  for (const hash of remove) {
    try {
      await desktop.backupFs.deleteFile.mutate({ root, path: `${poolDir}/${hash}` });
    } catch (e) {
      // Best-effort: a concurrent tick may have already removed it. Log + continue.
      logger.warn(`[auto-backup] gc: could not delete pool blob ${hash}:`, e);
    }
  }
  if (remove.length > 0) {
    logger.log(`[auto-backup] ${sanitized}: GC removed ${remove.length} unreferenced pool blob(s).`);
  }
}

/** Show a desktop notification announcing a just-created automatic backup (auto-
 *  run only; the manual "Back up now" flow keeps its inline "Backup saved."
 *  line). The body reflects the mode (notes-only vs with-attachments) and, for
 *  full mode, how many attachments were included / not cached. Best-effort —
 *  silently skipped if OS notifications are unsupported or the IPC fails. */
function notifyBackupCreated(
  mode: "partial" | "full",
  fullCounts?: { referenced: number; uncached: number; total: number | undefined }
): void {
  const t = i18n.global.t.bind(i18n.global);
  const title = t("settings.backup.notifyTitle");
  const body = buildBackupNotificationBody(
    mode,
    fullCounts ? { referenced: fullCounts.referenced, uncached: fullCounts.uncached } : undefined,
    t
  );
  void desktop.notifications.show.mutate({ title, body }).catch(() => {
    /* best-effort — OS notifications may be unsupported / IPC unavailable */
  });
}

export const useAutoBackupStore = defineStore("auto-backup", () => {
  /** A tick is currently running (prevents overlap). */
  const busy = ref(false);
  const lastError = ref<string | null>(null);
  /** ISO string of the last completed tick (any context), for diagnostics. */
  const lastTickAt = ref<string | null>(null);

  /** Initialise the scheduler: arm the initial + interval timers. Idempotent
   *  (guarded by `initialized`). Safe to call on every boot. */
  function init(): void {
    if (initialized) return;
    initialized = true;
    tickTimer = setTimeout(() => {
      void tick();
    }, INITIAL_DELAY_MS);
    tickInterval = setInterval(() => {
      void tick();
    }, RECHECK_INTERVAL_MS);
  }

  /** One scheduler tick: enumerate every context and back up any that are due.
   *  Never throws at the top level. Short-circuits when already in flight or
   *  when no backup directory is configured. */
  async function tick(): Promise<void> {
    if (inFlight) return;
    const config = useConfigStore();
    const root = config.backupDirectory;
    if (!root) return;
    inFlight = true;
    busy.value = true;
    lastError.value = null;
    try {
      const activeCtx = getCurrentContext();
      const accounts = await listAccounts();
      const contexts: ContextId[] = [LOCAL_CONTEXT, ...accounts.map((a) => a.contextId)];
      for (const ctx of contexts) {
        try {
          await processContext(ctx, activeCtx, root);
        } catch (e) {
          // Per-context isolation: one account's failure never aborts the tick
          // or skips the next account.
          logger.error(`[auto-backup] context ${ctx} failed:`, e);
        }
      }
      lastTickAt.value = new Date().toISOString();
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      logger.error("[auto-backup] tick failed:", e);
    } finally {
      inFlight = false;
      busy.value = false;
    }
  }

  /** Evaluate both cadences for one context and back up whichever is due. */
  async function processContext(
    ctx: ContextId,
    activeCtx: ContextId,
    root: string
  ): Promise<void> {
    const config = useConfigStore();
    const now = Date.now();
    for (const mode of ["partial", "full"] as const) {
      const offset = mode === "partial" ? config.backupReminderOffset : config.fullBackupReminderOffset;
      const cadenceMs = cadenceToMs(offset);
      if (cadenceMs === null) continue; // disabled (never / unknown)
      const lastRun = readStamp(ctx, mode);
      if (!isDue(lastRun, cadenceMs, now)) continue;
      await backupContext(ctx, mode, activeCtx, root, config.encryptBackups);
    }
  }

  /** Back up one context in one mode and rotate. Throws on failure (caller
   *  isolates per-context). Stamps the per-context per-mode last-run only on
   *  full success. */
  async function backupContext(
    ctx: ContextId,
    mode: "partial" | "full",
    activeCtx: ContextId,
    root: string,
    encrypt: boolean
  ): Promise<void> {
    // Reuse the singleton for the active context (its exclusive SQLite lock
    // would contend if re-opened); open a throwaway DB for every other context.
    // No teardown either way: core has no `Database.close`, so the non-active
    // throwaway ref is simply dropped (GC) and the active singleton is untouched.
    const db = ctx === activeCtx ? getDatabase() : await openAccountDb(ctx);

    const sanitized =
      ctx === LOCAL_CONTEXT
        ? "local"
        : sanitizeAccountDirName((await getAccount(ctx))?.email ?? "user");

    // Build options conditionally — `exactOptionalPropertyTypes` rejects an
    // explicit `undefined` for an optional prop, so only set `encrypt` when on.
    const exportOpts: { type: "node"; mode: "partial" | "full"; encrypt?: boolean } = {
      type: "node",
      mode
    };
    if (encrypt) exportOpts.encrypt = true;

    // Collect file chunks (+ attachment progress for full mode). Attachment
    // progress chunks are processed AFTER the drain (the onProgress callback
    // isn't awaited inside `collectBackupExport`, so async writes there would
    // race; collecting + processing after is equivalent and correct).
    const attachmentProgress: BackupAttachmentProgress[] = [];
    const { files } = await collectBackupExport(
      db.backup.export(exportOpts),
      mode === "full" ? (p) => attachmentProgress.push(p) : undefined
    );

    let created = false;
    let fullCounts: { referenced: number; uncached: number; total: number | undefined } | undefined;
    if (mode === "partial") {
      created = await writePartialBackup(root, sanitized, files);
    } else {
      const full = await writeFullBackupTree(root, sanitized, files, attachmentProgress);
      created = true;
      fullCounts = { referenced: full.referenced, uncached: full.uncached, total: full.total };
    }

    // Nothing written (an empty or refused-truncated partial) → don't stamp /
    // rotate / notify, so the next tick retries. (A throw above also skips this
    // block via the per-context catch, so a failed backup retries too.)
    if (!created) return;

    // Stamp the per-context per-mode last-run only on a successful write; rotate
    // after; reclaim pool blobs no retained full backup references (after rotate,
    // so the just-written manifest is always in the retained set).
    writeStamp(ctx, mode);
    await rotate(root, sanitized, mode);
    if (mode === "full") await gcAttachments(root, sanitized);

    // Announce the new backup with a desktop notification (auto-run only — the
    // manual "Back up now" flow keeps its inline "Backup saved." line). Text
    // reflects the mode + attachment counts.
    notifyBackupCreated(mode, fullCounts);
  }

  /** Write a partial backup as a single `<stamp>.nnbackup` file. Mirrors the
   *  manual "Back up now" filter (drop the `.nnbackup` marker + any attachment
   *  files, which partial mode never yields anyway). A multi-chunk partial
   *  (>10MB) is the `.nnbackupz` case (out of scope): we REFUSE rather than write
   *  a truncated single-file backup the user would trust — partial mode is
   *  single-file by design, and a large account should use full mode (which
   *  writes every chunk at its own path). Returns `false` (nothing written) so the
   *  caller skips stamp/rotate/notify and the next tick retries; multi-file
   *  `.nnbackupz` support is a follow-up. */
  async function writePartialBackup(
    root: string,
    sanitized: string,
    files: BackupFileChunk[]
  ): Promise<boolean> {
    const dataChunks = files.filter(
      (f) => f.path !== ".nnbackup" && !f.path.startsWith("attachments/")
    );
    if (dataChunks.length === 0) {
      logger.warn(`[auto-backup] ${sanitized}/partial: export produced no data chunks`);
      return false;
    }
    if (dataChunks.length > 1) {
      logger.warn(
        `[auto-backup] ${sanitized}/partial: export yielded ${dataChunks.length} data chunks (>.nnbackup single-file limit); refusing to write a truncated partial — use full mode. .nnbackupz support is a follow-up.`
      );
      return false;
    }
    const dir = `${sanitized}/partial`;
    await desktop.backupFs.ensureDir.mutate({ root, path: dir });
    const name = backupFilename("partial");
    await desktop.backupFs.writeFileText.mutate({
      root,
      path: `${dir}/${name}`,
      data: dataChunks[0]!.data
    });
    return true;
  }

  /** Rotate one account/mode's backups: keep the newest `backupRetentionCount`
   *  (clamped to >= 1), delete the rest. Safe because rotation runs AFTER the
   *  write + stamp, so the just-written backup is the newest and always kept. */
  async function rotate(
    root: string,
    sanitized: string,
    mode: "partial" | "full"
  ): Promise<void> {
    const config = useConfigStore();
    const keep = Math.max(1, config.backupRetentionCount);
    const dir = `${sanitized}/${mode}`;
    const entries = await desktop.backupFs.listDir.query({ root, path: dir });
    const regex = mode === "partial" ? PARTIAL_NAME_RE : FULL_NAME_RE;
    const matches = entries.filter((e) => regex.test(e));
    matches.sort(); // ascending = oldest first
    matches.reverse(); // newest first
    const toDelete = matches.slice(keep); // older than the keep window
    for (const name of toDelete) {
      const rel = `${dir}/${name}`;
      try {
        if (mode === "partial") {
          await desktop.backupFs.deleteFile.mutate({ root, path: rel });
        } else {
          await desktop.backupFs.removeDir.mutate({ root, path: rel });
        }
      } catch (e) {
        // Best-effort: a concurrent tick may have already removed it. Log + continue.
        logger.warn(`[auto-backup] rotate: could not delete ${rel}:`, e);
      }
    }
  }

  /** Manual "Back up now → Full" for the current context: run a full export
   *  and write it through the SAME dir-tree + dedup pool + rotate + GC path as
   *  the scheduler (so manual and auto full backups share one pool per account
   *  and dedup against each other). `root` is the configured backup directory
   *  (the caller ensures one is set). Returns `{ ok: true }` on success or
   *  `{ ok: false, error }` — never throws. */
  async function backupNowFull(
    root: string,
    encrypt: boolean
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    // Same-process double-fire guard (a rapid double-click before the button's
    // `busy` disable takes effect). Cross-process safety — vs the main window's
    // auto-tick, which shares the on-disk pool + GC but NOT this module state
    // (the Settings window is a separate renderer) — is handled at the data
    // layer: `writeFullBackupTree` writes the manifest before the blobs, so a
    // concurrent GC can't sweep a blob this backup is about to claim.
    if (inFlight) return { ok: false, error: "A backup is already running." };
    inFlight = true;
    busy.value = true;
    try {
      const db = getDatabase();
      const ctx = getCurrentContext();
      const sanitized =
        ctx === LOCAL_CONTEXT
          ? "local"
          : sanitizeAccountDirName((await getAccount(ctx))?.email ?? "user");
      const exportOpts: { type: "node"; mode: "full"; encrypt?: boolean } = {
        type: "node",
        mode: "full"
      };
      if (encrypt) exportOpts.encrypt = true;
      const attachmentProgress: BackupAttachmentProgress[] = [];
      const { files } = await collectBackupExport(
        db.backup.export(exportOpts),
        (p) => attachmentProgress.push(p)
      );
      await writeFullBackupTree(root, sanitized, files, attachmentProgress);
      await rotate(root, sanitized, "full");
      await gcAttachments(root, sanitized);
      // Stamp the full cadence so an imminent auto-tick doesn't immediately
      // redo this (mirrors `backupContext`'s `writeStamp`).
      writeStamp(ctx, "full");
      return { ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      logger.error("[auto-backup] backupNowFull failed:", e);
      return { ok: false, error };
    } finally {
      inFlight = false;
      busy.value = false;
    }
  }

  return {
    busy,
    lastError,
    lastTickAt,
    init,
    tick,
    backupNowFull
  };
});

/** Reset module-level init state for tests (mirrors `resetUpdaterInitForTests`). */
export function resetAutoBackupInitForTests(): void {
  initialized = false;
  inFlight = false;
  if (tickTimer) clearTimeout(tickTimer);
  if (tickInterval) clearInterval(tickInterval);
  tickTimer = undefined;
  tickInterval = undefined;
}