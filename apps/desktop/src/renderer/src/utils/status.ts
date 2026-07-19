/**
 * Pure status-bar logic (Phase 3.4) — word/character counts, cursor
 * line/column, and sync-status formatting. Kept framework-agnostic so it is
 * unit-tested in isolation (see `tests/contract/status.spec.ts`). The
 * `useStatusStore` holds the reactive state; `Editor.vue` pushes computed
 * editor stats in via `setEditorStats`, and `App.vue` drives sync state via
 * `refreshSync` + `bindSyncEvents`.
 */

/** Sync progress states surfaced by the status bar. `offline` is derived in
 * the view from auth (local-only mode never syncs); the store only tracks the
 * server-sync lifecycle. */
export type SyncState = "idle" | "syncing" | "synced" | "error";

/** Minimal slice of the TipTap `Editor` `readEditorStats` needs, so the util
 * is testable with a stub instead of a real ProseMirror instance. `getText`
 * mirrors TipTap's options-object signature (`{ blockSeparator }`), and
 * `textBetween` mirrors ProseMirror's optional, null-or-callback `leafText`. */
export interface EditorLike {
  getText(options?: { blockSeparator?: string; textSerializers?: unknown }): string;
  state: {
    selection: { $from: { pos: number } };
    doc: {
      textBetween(
        from: number,
        to: number,
        blockSeparator?: string | null,
        leafText?: string | null | ((leafNode: unknown) => string)
      ): string;
    };
  };
}

export interface EditorStats {
  wordCount: number;
  charCount: number;
  cursorLine: number;
  cursorColumn: number;
}

/**
 * Count whitespace-separated words. An empty/whitespace-only string is 0
 * words; a run of whitespace is a single separator (no empty tokens counted).
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/u).length;
}

/**
 * Line + 1-based column for a cursor, given the editor text *before* the
 * cursor (with `\n` as the block separator). Line = newline count + 1;
 * column = chars after the last newline + 1.
 */
export function cursorLineCol(textBeforeCursor: string): { line: number; column: number } {
  let newlines = 0;
  for (let i = 0; i < textBeforeCursor.length; i++) {
    if (textBeforeCursor.charCodeAt(i) === 10) newlines++;
  }
  const line = newlines + 1;
  const lastNL = textBeforeCursor.lastIndexOf("\n");
  const column = lastNL === -1 ? textBeforeCursor.length + 1 : textBeforeCursor.length - lastNL;
  return { line, column };
}

/**
 * Read word/char counts + cursor position from a TipTap editor. The block
 * separator is `\n` (both for `getText` and `textBetween`) so newline-based
 * line counting stays consistent between the full text and the cursor prefix.
 */
export function readEditorStats(editor: EditorLike): EditorStats {
  const text = editor.getText({ blockSeparator: "\n" });
  const before = editor.state.doc.textBetween(0, editor.state.selection.$from.pos, "\n", "\n");
  const { line, column } = cursorLineCol(before);
  return { wordCount: countWords(text), charCount: text.length, cursorLine: line, cursorColumn: column };
}

/**
 * Human relative time for the last successful sync. `now` is injectable for
 * deterministic tests. `lastSynced === 0` means "never synced".
 */
export function formatSyncRelative(lastSynced: number, now: number = Date.now()): string {
  if (!lastSynced) return "Never synced";
  const diff = now - lastSynced;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 2 * 86_400_000) return "Yesterday";
  const d = new Date(lastSynced);
  const nowD = new Date(now);
  const sameYear = d.getFullYear() === nowD.getFullYear();
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric"
  });
}

/**
 * Compose the full sync-status string the bar shows. Local-only (not logged
 * in) always reads "Local only" regardless of the stored sync lifecycle; an
 * in-progress or aborted sync overrides the relative timestamp. When the
 * store reports unsynced local changes, a `• unsynced` marker follows the
 * relative time (or `Unsynced` when never synced yet).
 */
export function syncStatusText(
  isLoggedIn: boolean,
  state: SyncState,
  lastSynced: number,
  hasUnsynced: boolean,
  now: number = Date.now()
): string {
  if (!isLoggedIn) return "Local only";
  if (state === "syncing") return "Syncing…";
  if (state === "error") return "Sync error";
  if (!lastSynced) return hasUnsynced ? "Unsynced" : "Never synced";
  const relative = formatSyncRelative(lastSynced, now);
  return hasUnsynced ? `${relative} • unsynced` : relative;
}