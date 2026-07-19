/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

interface Window {
  appEvents: {
    onNoteChanged(listener: (noteId: string) => void): () => void;
    onOpenNote(listener: (noteId: string) => void): () => void;
    onCloseTab(listener: (tabId: string) => void): () => void;
    onExternalDrop(listener: (paths: string[]) => void): () => void;
  };
  os: string;
  /**
   * Exposed by `exposeElectronTRPC()` in the preload. `ipcLink()` reads this
   * global to route tRPC calls over Electron IPC. Structural type mirrors
   * `RendererGlobalElectronTRPC` from `electron-trpc` (not publicly exported).
   */
  electronTRPC: {
    sendMessage: (args: unknown) => void;
    onMessage: (callback: (args: unknown) => void) => void;
  };
}