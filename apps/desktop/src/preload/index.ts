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
  onOpenNoteAt(listener: (payload: { noteId: string; x: number; y: number }) => void): () => void {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { noteId: string; x: number; y: number }
    ) => listener(payload);
    ipcRenderer.on("app:open-note-at", handler);
    return () => ipcRenderer.removeListener("app:open-note-at", handler);
  },
  // A pane (group leaf + its tabs) dragged from another window was released over
  // THIS window. `snapshot` is the pane's LayoutSnapshot; `x`/`y` are the cursor
  // in THIS window's client coords so the receiver can run the same edge-zone
  // split logic its in-window `EditorPane` uses. Main forwards this from
  // `releasePane` when a pane grip drag ends over a different app window.
  onOpenPaneAt(
    listener: (payload: {
      snapshot: import("../contracts/session-state").LayoutSnapshot;
      x: number;
      y: number;
    }) => void
  ): () => void {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: {
        snapshot: import("../contracts/session-state").LayoutSnapshot;
        x: number;
        y: number;
      }
    ) => listener(payload);
    ipcRenderer.on("app:open-pane-at", handler);
    return () => ipcRenderer.removeListener("app:open-pane-at", handler);
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
  },
  onDataChanged(listener: () => void): () => void {
    const handler = () => listener();
    ipcRenderer.on("app:data-changed", handler);
    return () => ipcRenderer.removeListener("app:data-changed", handler);
  },
  // A reminder notification fired in the main process. The renderer refreshes
  // its reminders store (so a fired once-reminder drops out of active, and a
  // repeat reminder reschedules to its next occurrence via
  // `getUpcomingReminderTime`).
  onReminderFired(listener: (id: string) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, id: string) => listener(id);
    ipcRenderer.on("app:reminder-fired", handler);
    return () => ipcRenderer.removeListener("app:reminder-fired", handler);
  },
  // The app is about to quit (Cmd+Q / tray Quit / last-window close). Sent by
  // main's `before-quit` handler so the renderer can flush its last editor-
  // session layout snapshot before the process exits. Best-effort: the IPC
  // mutation may not land before quit, so main also writes its own cached copy.
  onBeforeQuit(listener: () => void): () => void {
    const handler = () => listener();
    ipcRenderer.on("app:before-quit", handler);
    return () => ipcRenderer.removeListener("app:before-quit", handler);
  },
  // Live auto-updater state push from main (`main/updater.ts` emits on every
  // `autoUpdater` event + check/download call). The renderer's updater store
  // subscribes to drive live download progress + "ready to install" state
  // without polling. Payload is the `UpdateStatus` snapshot.
  onUpdaterStatus(listener: (status: import("../contracts/router").UpdateStatus) => void): () => void {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: import("../contracts/router").UpdateStatus
    ) => listener(status);
    ipcRenderer.on("updater:status", handler);
    return () => ipcRenderer.removeListener("updater:status", handler);
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