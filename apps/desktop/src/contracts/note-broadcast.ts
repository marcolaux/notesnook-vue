/**
 * Pure target selection for the cross-window `app:note-changed` broadcast.
 *
 * When a note is saved in one window, main forwards the change to every *other*
 * live window so an editor showing the same note can reload. Extracted from the
 * Electron-only `WindowServer.notifyNoteChanged` impl (which can't be unit-tested
 * because it touches `BrowserWindow`) so the exclusion logic — skip the sender, skip
 * destroyed windows — is contract-testable. Mirrors the `shouldTearOffTab`-in-
 * contracts pattern.
 *
 * `senderId` is the webContents id of the window that issued the save (captured via
 * the tRPC `createContext`); `undefined` means the caller couldn't be identified, in
 * which case every live window is notified (the sender may then receive its own
 * event, which the renderer's skip-if-dirty guard handles safely).
 */
export interface BroadcastWindow {
  id: number;
  destroyed: boolean;
}

export function selectBroadcastTargets(
  windows: BroadcastWindow[],
  senderId: number | undefined
): number[] {
  return windows
    .filter((w) => !w.destroyed && w.id !== senderId)
    .map((w) => w.id);
}