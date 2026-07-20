import { contextBridge, ipcRenderer } from "electron";
import { exposeElectronTRPC } from "../shared/electron-trpc-shim";
import type { TrayActionId } from "../contracts/tray";

/**
 * Preload bridge — exposes a tiny, typed surface to the renderer via
 * contextBridge. Mirrors the shape of the upstream `apps/desktop` preload so
 * our renderer can later swap in `electron-trpc` without changing the shape.
 *
 * Security: contextIsolation:true, nodeIntegration:false. The renderer only
 * sees what is exposed here — no require, no ipcRenderer.invoke.
 *
 * `exposeElectronTRPC()` exposes `window.trpc`, which `ipcLink()` in the
 * renderer uses to reach the main-process tRPC router. It must run after the
 * preload's `loaded` event so the Electron globals are available.
 */

const appEvents = {
  onNoteChanged(listener: (noteId: string) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, noteId: string) =>
      listener(noteId);
    ipcRenderer.on("app:note-changed", handler);
    return () => ipcRenderer.removeListener("app:note-changed", handler);
  },
  onOpenNote(listener: (noteId: string) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, noteId: string) =>
      listener(noteId);
    ipcRenderer.on("app:open-note", handler);
    return () => ipcRenderer.removeListener("app:open-note", handler);
  },
  onCloseTab(listener: (tabId: string) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, tabId: string) =>
      listener(tabId);
    ipcRenderer.on("app:close-tab", handler);
    return () => ipcRenderer.removeListener("app:close-tab", handler);
  },
  onExternalDrop(listener: (paths: string[]) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, paths: string[]) =>
      listener(paths);
    ipcRenderer.on("app:external-drop", handler);
    return () => ipcRenderer.removeListener("app:external-drop", handler);
  },
  onTrayAction(listener: (actionId: TrayActionId) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, actionId: TrayActionId) =>
      listener(actionId);
    ipcRenderer.on("app:tray-action", handler);
    return () => ipcRenderer.removeListener("app:tray-action", handler);
  }
};

void contextBridge.exposeInMainWorld("appEvents", appEvents);
void contextBridge.exposeInMainWorld("os", process.platform);

// Expose the tRPC IPC bridge as `window.trpc`. `electron-trpc` registers its
// own contextBridge call internally; we just trigger it once the preload is
// loaded. `process` is available because `sandbox: false` in webPreferences.
process.once("loaded", () => {
  exposeElectronTRPC();
});