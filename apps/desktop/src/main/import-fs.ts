/**
 * Main-process import-FS server — backs the Settings → Import section. Reads
 * the user-chosen Standard Notes export folder from disk so the renderer can
 * enumerate note files and ingest sibling media without a per-file picker.
 *
 * Distinct from the `fs` router (fixed-location chunk store for attachments)
 * and the `dialog` router (single user-picked UTF-8 file): this is a bulk,
 * directory-scoped read API (list entries, read bytes, read UTF-8) used only
 * by the importer. Electron + node only; not contract-tested (the renderer
 * reaches it via the typed `desktop.importFs.*` bridge).
 *
 * Reads are confined to the directory the user explicitly picked in the
 * folder picker (`selectDirectory`) — every path is resolved and enforced to
 * stay inside that directory before touching the filesystem, so a crafted
 * `name` ("../../etc/passwd") cannot escape.
 */
import { readdir, stat, readFile } from "node:fs/promises";
import { type Dirent } from "node:fs";
import { join, resolve, sep } from "node:path";
import { registerImportFsServer, type ImportFsServer, type ImportFsEntry } from "../contracts/router";

/** The user-chosen root directory for the in-progress import. The renderer
 *  passes `dir` to every call and we additionally enforce containment here. */
function safeChild(root: string, name: string): string {
  const rootResolved = resolve(root);
  const child = resolve(rootResolved, name);
  // Reject any `name` that escapes the picked root via traversal segments.
  if (!child.startsWith(rootResolved + sep) && child !== rootResolved) {
    throw new Error(`Path "${name}" escapes import directory`);
  }
  return child;
}

export function createImportFsServer(): ImportFsServer {
  return {
    async list(dir: string): Promise<ImportFsEntry[]> {
      const entries = await readdir(dir, { withFileTypes: true });
      const out: ImportFsEntry[] = [];
      for (const entry of entries) {
        // Skip dotfiles (e.g. `.DS_Store`) — never relevant to a SN export.
        if (entry.name.startsWith(".")) continue;
        let size = 0;
        try {
          if (!entry.isDirectory()) {
            size = (await stat(join(dir, entry.name))).size;
          }
        } catch {
          size = 0;
        }
        out.push({ name: entry.name, size, isDir: entry.isDirectory() });
      }
      return out;
    },
    async listRecursive(dir: string): Promise<ImportFsEntry[]> {
      // Recursively walk `dir`, returning every file with a path RELATIVE to
      // `dir` (using `/` separators). Dotfiles are skipped at every level.
      // Relative paths feed straight back into `readBytes`/`readUtf8` (whose
      // `safeChild` guard accepts subpaths), so the renderer can resolve a
      // media file or note file found anywhere under the chosen root.
      const out: ImportFsEntry[] = [];
      async function walk(rel: string): Promise<void> {
        const abs = rel ? join(dir, rel) : dir;
        let entries: Dirent[];
        try {
          entries = await readdir(abs, { withFileTypes: true });
        } catch {
          return; // unreadable subfolder — skip rather than abort the whole walk.
        }
        for (const entry of entries) {
          if (entry.name.startsWith(".")) continue;
          const childRel = rel ? `${rel}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            await walk(childRel);
          } else {
            let size = 0;
            try {
              size = (await stat(join(abs, entry.name))).size;
            } catch {
              size = 0;
            }
            out.push({ name: childRel, size, isDir: false });
          }
        }
      }
      await walk("");
      return out;
    },
    async readBytes(dir: string, name: string): Promise<Uint8Array> {
      const buf = await readFile(safeChild(dir, name));
      // `Buffer` is a `Uint8Array`; return the shared view directly so the
      // structured-clone IPC round-trip is zero-copy-ish.
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    },
    async readUtf8(dir: string, name: string): Promise<string> {
      return readFile(safeChild(dir, name), "utf-8");
    }
  };
}

/** Register the import-FS server with the tRPC bridge. Call once on main boot. */
export function registerImportFs(): void {
  registerImportFsServer(createImportFsServer());
}

