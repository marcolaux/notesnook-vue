/**
 * Session restore (renderer) — rehydrates the editor-layout store from the
 * per-account session saved by main (`userData/session.json`), and reopens the
 * torn-off note windows that were open when the app last quit.
 *
 * The renderer drives BOTH (a) layout hydration and (b) note-window reopen —
 * because both are account-scoped (note ids belong to the current account's
 * DB), and only the renderer that has booted the account DB knows which notes
 * still exist. This eliminates the "restore notes for the wrong account"
 * failure mode entirely: invalid / trashed / foreign note ids are dropped by
 * `filterLayoutSnapshot` before `hydrate`, and skipped before `openNote`.
 *
 * Headless-safe: any main-bridge failure (e.g. contract tests without a main
 * process) is caught and silently no-ops — restore never throws into boot.
 */
import { desktop } from "./desktop-bridge";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useNotesStore } from "@/stores/notes";
import {
  filterLayoutSnapshot,
  type ContextSession,
  type WindowBounds
} from "@contracts/session-state";

/** The context most recently restored — suppresses redundant restores. */
let lastRestoredContext: string | null = null;

/**
 * Restore the saved session for `contextId`: hydrate the editor-layout store
 * with the (filtered) main-window layout snapshot, then reopen each valid
 * torn-off note window. Call after `notes.load()` has populated the list (so
 * `items` is the source of valid note ids) and after `editorLayout.init()`.
 *
 * Note windows are opened with their saved bounds so they reappear at their
 * last size/position. `contextId` is forwarded so main tracks each note window
 * under this account (it reopens next run too).
 */
export async function restoreSession(contextId: string): Promise<void> {
  const layout = useEditorLayoutStore();
  const notes = useNotesStore();

  // Guard against re-restoring the same context (onMounted + the showShell
  // watch can both run for the initial context; a sync-completion reload must
  // not reopen note windows). A context switch changes the id → restore runs.
  if (lastRestoredContext === contextId) return;
  lastRestoredContext = contextId;

  let session: ContextSession;
  try {
    session = await desktop.session.loadLayout.query({ contextId });
  } catch {
    // Main unreachable (tests / not yet booted) — nothing to restore.
    return;
  }

  const validNoteIds = notes.items.map((n) => n.id);
  const filtered = filterLayoutSnapshot(session.mainWindowOpenTabs, validNoteIds);
  layout.hydrate(filtered);

  // Reopen note windows whose note still exists in this account. Skip ones
  // whose note was trashed/deleted/foreign — they'd open to nothing.
  for (const w of session.noteWindows) {
    if (!validNoteIds.includes(w.noteId)) continue;
    try {
      await desktop.window.openNote.mutate({
        noteId: w.noteId,
        bounds: w.bounds satisfies WindowBounds,
        contextId
      });
    } catch {
      // Best-effort: a failed reopen must not abort the rest.
    }
  }
}