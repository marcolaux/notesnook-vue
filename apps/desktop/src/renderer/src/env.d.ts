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
    onTrayAction(listener: (actionId: import("@contracts/tray").TrayActionId) => void): () => void;
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

/**
 * Window Controls Overlay (Phase 3.1) — present on `navigator` only when the
 * window was created with `titleBarOverlay` (Windows/Linux). Used by
 * `TitleBar.vue` to measure the real caption-button width so its content clears
 * the OS-drawn min/max/close buttons. Ambient declaration because TS's DOM lib
 * does not ship this API.
 */
interface WindowControlsOverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface WindowControlsOverlay {
  visible: boolean;
  getTitlebarArea(): WindowControlsOverlayRect;
  addEventListener(
    type: "geometrychange",
    listener: (event: Event & { titlebarAreaRect: WindowControlsOverlayRect }) => void
  ): void;
  removeEventListener(
    type: "geometrychange",
    listener: (event: Event & { titlebarAreaRect: WindowControlsOverlayRect }) => void
  ): void;
}
interface Navigator {
  readonly windowControlsOverlay?: WindowControlsOverlay;
}