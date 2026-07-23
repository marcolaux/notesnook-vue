/**
 * Main-process window server (Phase 7.0 on-site) — implements the
 * {@link WindowServer} contract and registers it with the tRPC bridge.
 *
 *  - `setNativeTheme`: maps the renderer's `themeMode` (light/dark/system) to
 *    Electron's `nativeTheme.themeSource` so the OS-native window material
 *    (macOS `vibrancy: "under-window"`, Windows `backgroundMaterial: "acrylic"`)
 *    follows the app theme. Without this the acrylic tracks the *system*
 *    appearance and a dark UI on a light-mode system renders as washed-out
 *    white text on a bright acrylic.
 *  - `openSettings`: opens the shared singleton Settings window
 *    (`src/main/settings-window.ts`). Needs the preload path (resolved from the
 *    main module's `__dirname`) so the settings window gets the same preload +
 *    tRPC bridge as the main window.
 *
 * Electron-only (no Node fs); not contract-tested — the renderer calls it
 * through the typed `desktop.window.*` bridge.
 */
import { BrowserWindow, nativeTheme, screen } from "electron";
import { registerWindowServer, type WindowServer } from "../contracts/router";
import type { WindowBounds } from "../contracts/session-state";
import { resolveTabRelease, type ScreenRect, type WindowRect } from "../contracts/tab-tear-off";
import { selectBroadcastTargets } from "../contracts/note-broadcast";
import { openSettingsWindow, isSettingsWindow } from "./settings-window";
import { openNoteWindow } from "./note-window";
import { resolveContextForSender } from "./session-state";

/** The main app window — set once it is created so `notifyDataChanged` can
 *  forward cross-window DB-mutation signals to it. */
let mainWindow: BrowserWindow | undefined;

/** Create the WindowServer impl. `preloadPath` is the absolute preload path. */
export function createWindowServer(preloadPath: string): WindowServer {
  return {
    setNativeTheme(mode: "light" | "dark" | "system"): void {
      nativeTheme.themeSource = mode;
    },
    openSettings(section: string | undefined): void {
      openSettingsWindow(preloadPath, section);
    },
    openNote(noteId: string, bounds?: WindowBounds | undefined, contextId?: string | undefined): void {
      openNoteWindow(preloadPath, noteId, bounds, contextId);
    },
    releaseTab(
      input: { noteId: string; startScreenX: number; startScreenY: number },
      senderId?: number | undefined
    ): {
      action: "none" | "moved" | "toreOff";
    } {
      // `dragend`'s `screenX/screenY` are unreliable on macOS when the drop
      // lands outside the window on a native surface (Finder), so read the live
      // cursor here. The dragstart point (captured reliably in the renderer while
      // the cursor was still inside the source window) identifies the source
      // window. HTML5 `dataTransfer` doesn't cross Electron windows, so a drop on
      // ANOTHER window's tab bar / drop zone is invisible to it — the move is
      // routed through main from the source's `dragend`: resolve the target from
      // the cursor + every window's OS bounds, then forward `app:open-note` to it
      // (it opens the note as a tab) or tear a new note window off.
      const end = screen.getCursorScreenPoint();
      const windows: WindowRect[] = BrowserWindow.getAllWindows()
        .filter((w) => !w.isDestroyed())
        .map((w) => {
          const b = w.getBounds();
          return {
            id: w.webContents.id,
            rect: { left: b.x, top: b.y, width: b.width, height: b.height } satisfies ScreenRect,
            isSettings: isSettingsWindow(w)
          };
        });
      const res = resolveTabRelease(input.startScreenX, input.startScreenY, end.x, end.y, windows);
      if (res.action === "moved" && res.targetId !== undefined) {
        const target = BrowserWindow.getAllWindows().find(
          (w) => !w.isDestroyed() && w.webContents.id === res.targetId
        );
        if (target) {
          if (target.isMinimized()) target.restore();
          target.show();
          target.focus();
          // The target renderer decides split-vs-move from the cursor's position
          // over its own editor body — HTML5 `dataTransfer` doesn't cross
          // windows, so the target's drop handlers never fire; we send the
          // release point as client coords (cursor − target window origin) so
          // it can run the SAME zone logic its in-window `EditorPane` uses. It's
          // already booted (the user dragged onto an existing window), so the
          // event is live.
          const tb = target.getBounds();
          target.webContents.send("app:open-note-at", {
            noteId: input.noteId,
            x: end.x - tb.x,
            y: end.y - tb.y
          });
          return { action: "moved" };
        }
        // Target vanished between resolve + send → fall through to tear-off.
      }
      if (res.action === "toreOff") {
        // Track the torn-off note window under the source window's account so
        // it reopens next run (it owns the same DB as the source). Best-effort:
        // if the source window isn't bound yet, the note window opens but isn't
        // persisted.
        const contextId = resolveContextForSender(senderId);
        openNoteWindow(preloadPath, input.noteId, undefined, contextId);
        return { action: "toreOff" };
      }
      return { action: "none" };
    },
    notifyDataChanged(): void {
      // Forward to the main window so it reloads its notes/collections/vault/
      // backup stores. Safe if the main window is gone (e.g. Settings opened
      // after it was closed) — the event is simply dropped.
      const win = mainWindow;
      if (win && !win.isDestroyed()) win.webContents.send("app:data-changed");
    },
    notifyNoteChanged(noteId: string, senderId: number | undefined): void {
      // Broadcast to every other live window so an editor showing the same note
      // can reload to the latest saved content. The sender (the window that
      // issued the save) is excluded so its own editor/cursor is never disrupted.
      // Pure target selection is extracted to `selectBroadcastTargets` for testing;
      // here we match its result back to the live `BrowserWindow`s by webContents id
      // (`BrowserWindow.fromId` keys on the *window* id, not the webContents id).
      const all = BrowserWindow.getAllWindows();
      const targets = new Set(
        selectBroadcastTargets(
          all.map((w) => ({ id: w.webContents.id, destroyed: w.isDestroyed() })),
          senderId
        )
      );
      for (const w of all) {
        if (!w.isDestroyed() && targets.has(w.webContents.id)) {
          w.webContents.send("app:note-changed", noteId);
        }
      }
    },
    close(): void {
      // The focused window is the one issuing the close (the user clicked a tab
      // close button or hit Cmd/Ctrl+W in it). `w.close()` fires the normal
      // close lifecycle (close events / before-quit), consistent with a
      // user-initiated close. No-op if nothing is focused.
      const w = BrowserWindow.getFocusedWindow();
      if (w && !w.isDestroyed()) w.close();
    }
  };
}

/**
 * Register the window server with the tRPC bridge. Call once on main boot with
 * the absolute preload path (same one passed to the main `BrowserWindow`).
 */
export function registerWindow(preloadPath: string): void {
  registerWindowServer(createWindowServer(preloadPath));
}

/** Record the main app window so `notifyDataChanged` can forward cross-window
 *  DB-mutation signals to it. Call after the main window is created. */
export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = undefined;
  });
}