/**
 * Session persistence (renderer) — debounced deep watcher over the
 * editor-layout store's five refs that pushes a `LayoutSnapshot` to main
 * (`desktop.session.saveLayout`) so the open tabs + split layout survive a
 * restart. Sash sizes are captured automatically (`resizeSplitChildren` writes
 * `LayoutNode.size`). Mounted in the MAIN window only (settings / note windows
 * don't own the layout).
 *
 * `setPersistenceSuppressed(true)` pauses writes during a context switch +
 * restore so the transient empty state (after `closeAllTabs`) is never written
 * to disk for the target account (which would clobber its saved session).
 *
 * `flushNow()` bypasses the debounce and writes the current state immediately
 * — called from the `app:before-quit` handler so the last layout lands on disk.
 * Best-effort: the IPC mutation may not land before quit, so main also writes
 * its own cached copy.
 *
 * Headless-safe: any main-bridge failure (e.g. contract tests) is caught and
 * silently no-ops.
 */
import { watch } from "vue";
import { desktop } from "@/platform/desktop-bridge";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { readCurrentContext } from "@/platform/account-context";
import type { LayoutSnapshot } from "@contracts/session-state";

const DEBOUNCE_MS = 400;

let suppressed = false;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let mounted = false;

function capture(): LayoutSnapshot {
  const l = useEditorLayoutStore();
  return {
    layout: l.layout,
    groups: l.groups,
    tabs: l.tabs,
    sessions: l.sessions,
    activeGroupId: l.activeGroupId
  };
}

async function doSave(): Promise<void> {
  if (suppressed) return;
  // Plain JSON copy so the IPC payload is free of Vue reactive proxies (which
  // don't structured-clone cleanly across the Electron bridge).
  const snapshot = JSON.parse(JSON.stringify(capture())) as LayoutSnapshot;
  const contextId = readCurrentContext();
  try {
    await desktop.session.saveLayout.mutate({ contextId, snapshot });
  } catch {
    // Main unreachable (tests / not booted) — no-op.
  }
}

function scheduleSave(): void {
  if (suppressed) return;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    void doSave();
  }, DEBOUNCE_MS);
}

/** Pause / resume writes. Resuming does not force a save (the restored state
 *  is already on disk; the next real change writes normally). */
export function setPersistenceSuppressed(value: boolean): void {
  suppressed = value;
  if (value && pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

/** Write the current layout state immediately (bypasses the debounce). Used by
 *  the `app:before-quit` handler. */
export function flushNow(): Promise<void> {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  return doSave();
}

/** Mount the debounced deep watcher. Idempotent — safe to call once per
 *  window; only call in the main window. */
export function useSessionPersistence(): void {
  if (mounted) return;
  mounted = true;
  const l = useEditorLayoutStore();
  watch(
    () => [l.layout, l.groups, l.tabs, l.sessions, l.activeGroupId],
    () => scheduleSave(),
    { deep: true }
  );
}