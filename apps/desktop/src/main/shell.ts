/**
 * Main-process shell server — implements the {@link ShellServer} contract and
 * registers it with the tRPC bridge. Backs the attachment preview's "Open
 * externally" action: write the decrypted attachment bytes (decryption happens
 * renderer-side — main has no `db` instance) to a temp file and open it with
 * the OS default handler (Electron `shell.openPath`).
 *
 * `writeTemp` sanitises the filename (strips path separators so a malicious/
 * weird filename can't escape the temp dir) and prefixes a UUID so repeated
 * opens of the same attachment don't collide and can't be guessed. Files
 * accumulate under `<temp>/notesnook-attachments/` — a cleanup-on-quit is a
 * future follow-up (v1 leaves them; they're in the OS temp dir anyway).
 *
 * Electron + node only; not contract-tested (the renderer reaches it via the
 * typed `desktop.shell.*` bridge).
 */
import { app, shell } from "electron";
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { registerShellServer, type ShellServer } from "../contracts/router";

/** Create the ShellServer impl. */
export function createShellServer(): ShellServer {
  return {
    async writeTemp({ filename, data }): Promise<{ path: string }> {
      const dir = path.join(app.getPath("temp"), "notesnook-attachments");
      mkdirSync(dir, { recursive: true });
      // Strip path separators + null bytes so the filename can't escape the dir.
      const safe = filename.replace(/[/\\:\0]/g, "_").slice(-200) || "attachment";
      const unique = `${randomUUID()}-${safe}`;
      const filePath = path.join(dir, unique);
      writeFileSync(filePath, data);
      return { path: filePath };
    },
    async openPath({ path: p }): Promise<string> {
      // `shell.openPath` resolves to the opened app's path on success or an
      // error string on failure (empty string on success).
      return shell.openPath(p);
    }
  };
}

/** Register the shell server with the tRPC bridge. Call once on main boot. */
export function registerShell(): void {
  registerShellServer(createShellServer());
}