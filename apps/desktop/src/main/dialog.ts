/**
 * Main-process dialog server (Phase 2) — implements the {@link DialogServer}
 * contract and registers it with the tRPC bridge. Backs the Backup & Export
 * section: "Backup now" writes a `.nnbackup` to a user-chosen path; "Restore"
 * reads one back.
 *
 *  - `saveFile`: `dialog.showSaveDialog` (parented to the focused window when
 *    one exists, else app-modal) → `fs/promises.writeFile` UTF-8. Returns
 *    `false` on cancel (no path), rejects on a write error.
 *  - `openFile`: `dialog.showOpenDialog` (single file, filtered to the given
 *    extensions) → `fs/promises.readFile` UTF-8. Returns `undefined` on cancel.
 *
 * This is a general user-chosen-path file API — distinct from the `fs` router,
 * which is a fixed-location chunk store for attachments. Electron + node only;
 * not contract-tested (the renderer reaches it via the typed `desktop.dialog.*`
 * bridge).
 */
import { dialog, BrowserWindow } from "electron";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { registerDialogServer, type DialogServer } from "../contracts/router";

/** The focused window to parent dialogs to, or `undefined` for app-modal. */
let parentWindow: (() => BrowserWindow | undefined) | undefined;

/** Create the DialogServer impl. `getParent` returns the window to attach
 *  dialogs to (or undefined for app-modal). */
export function createDialogServer(
  getParent: () => BrowserWindow | undefined
): DialogServer {
  return {
    async saveFile(defaultName: string, data: string): Promise<boolean> {
      const win = getParent();
      const result = win
        ? await dialog.showSaveDialog(win, {
            defaultPath: defaultName,
            filters: [{ name: "Notesnook backup", extensions: ["nnbackup"] }]
          })
        : await dialog.showSaveDialog({
            defaultPath: defaultName,
            filters: [{ name: "Notesnook backup", extensions: ["nnbackup"] }]
          });
      if (result.canceled || !result.filePath) return false;
      await writeFile(result.filePath, data, "utf-8");
      return true;
    },
    async openFile(extensions: string[]): Promise<{ name: string; data: string } | undefined> {
      const win = getParent();
      const result = win
        ? await dialog.showOpenDialog(win, {
            properties: ["openFile"],
            filters: [{ name: "Notesnook backup", extensions }]
        })
        : await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [{ name: "Notesnook backup", extensions }]
          });
      if (result.canceled || result.filePaths.length === 0) return undefined;
      const filePath = result.filePaths[0] as string;
      const data = await readFile(filePath, "utf-8");
      // `name` is the basename — used by the restore flow to detect `.nnbackupz`
      // (zip) vs legacy `.nnbackup` (single JSON).
      const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
      const name = slash >= 0 ? filePath.slice(slash + 1) : filePath;
      return { name, data };
    },
    async selectDirectory(): Promise<string | undefined> {
      const win = getParent();
      const result = win
        ? await dialog.showOpenDialog(win, {
            properties: ["openDirectory", "createDirectory"]
          })
        : await dialog.showOpenDialog({
            properties: ["openDirectory", "createDirectory"]
          });
      if (result.canceled || result.filePaths.length === 0) return undefined;
      return result.filePaths[0];
    },
    async saveFileToDir(dir: string, defaultName: string, data: string): Promise<boolean> {
      const fullPath = join(dir, defaultName);
      await writeFile(fullPath, data, "utf-8");
      return true;
    }
  };
}

/**
 * Register the dialog server with the tRPC bridge. Call once on main boot.
 * `getParent` returns the window to parent dialogs to (the focused app window
 * at call time), or undefined for app-modal dialogs.
 */
export function registerDialog(getParent: () => BrowserWindow | undefined): void {
  parentWindow = getParent;
  registerDialogServer(createDialogServer(getParent));
}

/** Update the parent-window resolver (e.g. when the main window is created
 *  after `registerDialog` was called). */
export function setDialogParent(getParent: () => BrowserWindow | undefined): void {
  parentWindow = getParent;
}