/**
 * tRPC-over-IPC bridge between the Electron main process and the renderer.
 *
 * `createIPCHandler` from `electron-trpc/main` registers an `ipcMain.handle`
 * listener on the `ELECTRON_TRPC_CHANNEL` for each window passed in. The
 * renderer reaches it via `ipcLink()` (see `platform/desktop-bridge.ts`), which
 * talks over `window.trpc` exposed by the preload's `exposeElectronTRPC()`.
 *
 * The router contract lives in `src/contracts/router.ts` and is the single
 * source of truth shared (type-only) with the renderer.
 */
import { BrowserWindow } from "electron";
import { createIPCHandler } from "../shared/electron-trpc-shim";
import { appRouter } from "../contracts/router";

/**
 * Attach the tRPC IPC handler to a window. Call once per window after it is
 * created. For the main window we pass it to `createIPCHandler`; for later
 * windows (multi-tab / settings / focus) use `handler.attachWindow(win)`.
 */
let handler: ReturnType<typeof createIPCHandler> | undefined;

export function attachTRPC(win: BrowserWindow): void {
  if (!handler) {
    handler = createIPCHandler({
      router: appRouter,
      windows: [win],
      // Expose the calling window's webContents id to procedures as `ctx.senderId`
      // (called per request with the `IpcMainEvent`). Used by `window.notifyNoteChanged`
      // to broadcast `app:note-changed` to every window EXCEPT the one that issued the
      // save, so the actively-edited editor is never disrupted by its own save.
      createContext: async ({ event }) => ({ senderId: event.sender.id })
    });
    return;
  }
  handler.attachWindow(win);
}