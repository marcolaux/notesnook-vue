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
  type BackupAttachmentProgress,
  type BackupFileChunk
} from "@/utils/backup";
import type { Database } from "@notesnook-vue/contracts";
import { logger } from "@/utils/logger";

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
 *  - **Full mode = directory tree.** A full backup is laid down as
 *    `<sanitized>/full/<stamp>-full/` containing the `.nnbackup` marker, the
 *    `attachments/.attachments_key`, the data chunks at their `chunk.path`, and
 *    each cached attachment's raw ENCRYPTED bytes at `attachments/<hash>` (read
 *    via `readAttachmentStream` — NOT decrypted). Dormant accounts (expired
 *    token) back up notes + only their LOCALLY-CACHED attachments; uncached ones
 *    are skipped silently by core (no progress chunk yielded).
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

    if (mode === "partial") {
      await writePartialBackup(root, sanitized, files);
    } else {
      await writeFullBackup(root, sanitized, files, attachmentProgress, db);
    }

    // Stamp only on full success (a throw above skips this + rotation, so a
    // failed backup retries on the next tick).
    writeStamp(ctx, mode);
    await rotate(root, sanitized, mode);
  }

  /** Write a partial backup as a single `<stamp>.nnbackup` file. Mirrors the
   *  manual "Back up now" filter (drop the `.nnbackup` marker + any attachment
   *  files, which partial mode never yields anyway). A multi-chunk partial
   *  (>10MB) is the `.nnbackupz` case (out of scope): write the first chunk +
   *  warn so the limitation is visible rather than silently truncating restore. */
  async function writePartialBackup(
    root: string,
    sanitized: string,
    files: BackupFileChunk[]
  ): Promise<void> {
    const dataChunks = files.filter(
      (f) => f.path !== ".nnbackup" && !f.path.startsWith("attachments/")
    );
    const dir = `${sanitized}/partial`;
    await desktop.backupFs.ensureDir.mutate({ root, path: dir });
    if (dataChunks.length === 0) {
      logger.warn(`[auto-backup] ${sanitized}/partial: export produced no data chunks`);
      return;
    }
    if (dataChunks.length > 1) {
      logger.warn(
        `[auto-backup] ${sanitized}/partial: export yielded ${dataChunks.length} data chunks (>.nnbackup single-file limit); writing first chunk only — multi-file .nnbackupz support is a follow-up.`
      );
    }
    const name = backupFilename("partial");
    await desktop.backupFs.writeFileText.mutate({
      root,
      path: `${dir}/${name}`,
      data: dataChunks[0]!.data
    });
  }

  /** Write a full backup as a directory tree `<sanitized>/full/<stamp>-full/`:
   *  the `.nnbackup` marker, `attachments/.attachments_key`, the data chunks at
   *  their `chunk.path`, and each cached attachment's raw encrypted bytes at
   *  `attachments/<hash>`. Uncached attachments (no progress chunk / no local
   *  stream) are skipped + counted. Logs a wrote/skipped summary. */
  async function writeFullBackup(
    root: string,
    sanitized: string,
    files: BackupFileChunk[],
    attachmentProgress: BackupAttachmentProgress[],
    db: Database
  ): Promise<void> {
    const dirName = fullBackupDirName();
    const base = `${sanitized}/full/${dirName}`;
    await desktop.backupFs.ensureDir.mutate({ root, path: base });
    await desktop.backupFs.ensureDir.mutate({ root, path: `${base}/attachments` });

    // Write every file chunk at its own `chunk.path` (the marker, the
    // `.attachments_key`, and the N data chunks). Ensure each parent dir exists.
    for (const f of files) {
      const slash = f.path.lastIndexOf("/");
      if (slash >= 0) {
        await desktop.backupFs.ensureDir.mutate({ root, path: `${base}/${f.path.slice(0, slash)}` });
      }
      await desktop.backupFs.writeFileText.mutate({ root, path: `${base}/${f.path}`, data: f.data });
    }

    // Copy each cached attachment's raw encrypted bytes to disk. Uncached
    // attachments were already skipped by core (no progress chunk yielded); a
    // missing local stream here is counted as skipped too.
    let wrote = 0;
    let skipped = 0;
    for (const p of attachmentProgress) {
      const stream = await readAttachmentStream(db, p.hash);
      if (!stream) {
        skipped++;
        continue;
      }
      const bytes = await drainStream(stream);
      await desktop.backupFs.writeFileBytes.mutate({
        root,
        path: `${base}/attachments/${p.hash}`,
        data: bytes
      });
      wrote++;
    }
    const total = attachmentProgress[0]?.total;
    // `total` (from core) counts ALL attachments; uncached ones core skipped
    // never appear in `attachmentProgress`, so uncached = total - (wrote+skipped)
    // when total is known.
    if (total !== undefined) {
      const uncached = Math.max(0, total - wrote - skipped);
      logger.log(
        `[auto-backup] ${sanitized}/full/${dirName}: wrote ${wrote} attachment(s), skipped ${skipped}, uncached ${uncached} of ${total}.`
      );
    } else {
      logger.log(`[auto-backup] ${sanitized}/full/${dirName}: wrote ${wrote} attachment(s), skipped ${skipped}.`);
    }
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

  return {
    busy,
    lastError,
    lastTickAt,
    init,
    tick
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