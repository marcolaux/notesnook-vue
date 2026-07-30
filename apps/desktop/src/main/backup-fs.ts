/**
 * Main-process backup-FS server — backs the per-account auto-backup scheduler
 * (`stores/auto-backup.ts`). Writes each account's backup tree (a partial
 * `.nnbackup` file, or a full-mode directory of data chunks + raw encrypted
 * attachment blobs) into its own subdirectory of the shared `backupDirectory`.
 *
 * Distinct from `import-fs.ts` (read-only bulk read for the importer) and the
 * `dialog` router (single user-picked UTF-8 file): this is a directory-scoped
 * API for the scheduler and restore — writes (mkdir, write text/bytes, delete
 * file/dir) plus the reads the dedup pool + restore need (exists, read text/
 * bytes, list). The scheduler/restore passes `root` (the configured backup
 * directory) plus a relative `path` to every call, and we re-derive containment
 * statelessly here — a crafted `path` ("../../etc/passwd", or an absolute path
 * outside `root`) cannot escape. Mirrors `import-fs.ts`'s `safeChild`.
 *
 * Electron + node only; not contract-tested directly (the renderer reaches it
 * via the typed `desktop.backupFs.*` bridge). `safeChild` is exported for a
 * containment unit test.
 */
import { mkdir, writeFile, readdir, rm, unlink, stat, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { registerBackupFsServer, type BackupFsServer } from "../contracts/router";

/** Resolve `<root>/<path>` and enforce it stays inside `root`. Rejects `..`
 *  traversal and absolute-outside-`root` paths. Returns the absolute child.
 *  Exported for a containment unit test. */
export function safeChild(root: string, path: string): string {
  const rootResolved = resolve(root);
  const child = resolve(rootResolved, path);
  if (!child.startsWith(rootResolved + sep) && child !== rootResolved) {
    throw new Error(`Path "${path}" escapes backup directory`);
  }
  return child;
}

export function createBackupFsServer(): BackupFsServer {
  return {
    async ensureDir(root, path): Promise<void> {
      await mkdir(safeChild(root, path), { recursive: true });
    },
    async writeFileText(root, path, data): Promise<void> {
      await writeFile(safeChild(root, path), data, "utf-8");
    },
    async writeFileBytes(root, path, data): Promise<void> {
      await writeFile(safeChild(root, path), data);
    },
    async exists(root, path): Promise<boolean> {
      try {
        await stat(safeChild(root, path));
        return true;
      } catch {
        // Missing path (ENOENT) or any other stat error → not present. Never
        // throws: the dedup pool's skip-if-exists rule treats a missing blob as
        // "not yet backed up" and writes it.
        return false;
      }
    },
    async readFileText(root, path): Promise<string> {
      return readFile(safeChild(root, path), "utf-8");
    },
    async readFileBytes(root, path): Promise<Uint8Array> {
      // `readFile` returns a Node `Buffer`; expose it as a `Uint8Array` view
      // (Buffer is a Uint8Array subclass, so this is zero-copy and structured-
      // clone-safe across Electron IPC for restore's blob read-back).
      return readFile(safeChild(root, path));
    },
    async listDir(root, path): Promise<string[]> {
      try {
        return await readdir(safeChild(root, path));
      } catch {
        // Missing directory → empty list (the scheduler treats this as "no
        // backups yet" on the first tick).
        return [];
      }
    },
    async deleteFile(root, path): Promise<void> {
      try {
        await unlink(safeChild(root, path));
      } catch (e) {
        // Swallow ENOENT — rotation may target a file a concurrent tick already
        // removed; anything else is logged but not fatal (rotation is best-effort).
        const code = (e as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw e;
      }
    },
    async removeDir(root, path): Promise<void> {
      await rm(safeChild(root, path), { recursive: true, force: true });
    }
  };
}

/** Register the backup-FS server with the tRPC bridge. Call once on main boot. */
export function registerBackupFs(): void {
  registerBackupFsServer(createBackupFsServer());
}