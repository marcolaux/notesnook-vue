import { contextBridge, ipcRenderer } from "electron";

/**
 * Preload bridge — exposes a tiny, typed surface to the renderer via
 * contextBridge. Mirrors the shape of the upstream `apps/desktop` preload so
 * our renderer can later swap in `electron-trpc` without changing the shape.
 *
 * Security: contextIsolation:true, nodeIntegration:false. The renderer only
 * sees what is exposed here — no require, no ipcRenderer.invoke.
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
  }
};

void contextBridge.exposeInMainWorld("appEvents", appEvents);
void contextBridge.exposeInMainWorld("os", process.platform);