/**
 * Navigation-history capture watcher — mounts the reactive listener that
 * snapshots navigable state into the {@link useNavHistoryStore} whenever any of
 * the seven navigation signals change (route, collectionFilter,
 * collections.selected, activeGroupId, activeTabId, tasksFilterActive,
 * daily.selectedDate).
 *
 * The capture is **rAF-deferred**: each signal change schedules a single
 * animation-frame flush (replacing any pending one), so all changes within one
 * render cycle — including the Tasks/Daily views' `onMounted` filter clears,
 * which fire AFTER the route change on a different tick — coalesce into ONE
 * push of the settled state. Without this, navigating to `/tasks` from a
 * notebook would push a dud intermediate entry (`/tasks` + collection still set)
 * that restores to the same place, forcing the user to press back twice.
 *
 * The store's `push` still handles suppression (during restore) and batching
 * (the `goToCollection` slow-query case, where a DB fetch can span more than one
 * frame and would split a single click into two entries). The rAF + batch +
 * dedup together keep one user action = one history entry.
 *
 * Mounted in `App.vue` alongside `useTabShortcuts`; every editor-bearing window
 * keeps its own per-window nav history. The composable owns only the watcher
 * — the title-bar buttons, palette commands, and keyboard shortcuts call the
 * store's `back`/`forward` directly.
 */
import { watch, onUnmounted, type WatchSource } from "vue";
import { useNavHistoryStore } from "@/stores/nav-history";
import { useNotesStore } from "@/stores/notes";
import { useCollectionsStore } from "@/stores/collections";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useDailyNotesStore } from "@/stores/daily-notes";
import { useAuthStore } from "@/stores/auth";
import { router } from "@/router";

export function useNavHistoryCapture(): void {
  const nav = useNavHistoryStore();
  const notes = useNotesStore();
  const collections = useCollectionsStore();
  const layout = useEditorLayoutStore();
  const daily = useDailyNotesStore();
  const auth = useAuthStore();

  // A single multi-source getter so one `watch` covers all seven signals.
  const signal: WatchSource<unknown> = () => [
    router.currentRoute.value.path,
    notes.collectionFilter,
    collections.selected,
    layout.activeGroupId,
    layout.activeTab?.id,
    notes.tasksFilterActive,
    daily.selectedDate
  ];

  // rAF-deferred coalescing: the last signal change in a render cycle wins.
  let rafId: number | null = null;
  const scheduleFlush = (): void => {
    if (rafId !== null) return; // already scheduled — keep the existing frame
    rafId = requestAnimationFrame(() => {
      rafId = null;
      // Don't capture before the shell is up (login screen / boot churn).
      if (!auth.showShell) return;
      nav.push(nav.snapshotCurrent());
    });
  };

  const stop = watch(signal, scheduleFlush, { flush: "pre" });

  onUnmounted(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    stop();
  });
}