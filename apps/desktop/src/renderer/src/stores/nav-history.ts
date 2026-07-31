/**
 * Navigation-history store — the global, per-window back/forward stack.
 *
 * Unlike the dormant per-tab `history`/`historyIndex` on `EditorTab` (which
 * only tracked note ids visited within a single tab and was never populated),
 * this store records every meaningful *navigation event* across the whole
 * workspace — note opens, tab switches, sidebar view switches (All Notes ↔
 * Daily ↔ Tasks ↔ …), collection (notebook/tag/color) selection, and tab
 * closes — as one restorable `NavTarget` snapshot, and lets the user step
 * back/forward through them. The title-bar Prev/Next buttons, the
 * `app:go-back`/`app:go-forward` palette commands, and the `Cmd+[`/`Cmd+]`
 * shortcuts all drive this store.
 *
 * Why a single global stack (not per-tab): the user's mental model is "where
 * was I" across the whole app, not "within this one tab". Switching tabs,
 * opening a note in a new tab, jumping to Daily Notes, and closing a note are
 * all steps on one timeline; back should walk that timeline regardless of
 * which surface the navigation crossed.
 *
 * Navigation state is scattered across four sources (no single source of
 * truth): the Vue Router route, `notes.collectionFilter` + `notes.tasksFilterActive`,
 * `collections.selected`, and editor-layout `activeGroupId`/`activeTabId`.
 * `snapshotCurrent()` reads all of them into one `NavTarget`; `restore()`
 * writes them back. `tabId`/`groupId` go stale on close/re-home, so they are
 * stored as *hints* only — the durable keys are `noteId` / `attachment.hash` /
 * `searchQuery`, and `restore()` falls back to them when the hint is gone.
 *
 * Feedback-loop control (the hard part):
 *  - `suppress` — incremented around `restore()` so the watcher ignores the
 *    state changes *we* cause (route push, filter clear, tab activate/open).
 *  - `beginBatch()`/`endBatch()` — a single user action (e.g. clicking a
 *    notebook) mutates several signals across an `await` (`goToCollection`:
 *    `await filterByCollection` then `router.push`); a one-microtask coalesce
 *    can't span that, so orchestration sites wrap their mutations in a batch
 *    and `endBatch` flushes a single pending capture.
 *  - `identityOf()` — the dedup key that excludes `groupId`/`tabId` (unstable).
 *    `push()` no-ops (just normalises the hints) when the new state's identity
 *    equals the current top's. This is the safety net: even if a watcher fires
 *    past `suppress` (e.g. an async `onMounted` filter clear), the resulting
 *    state matches the restored target → no spurious push → the forward stack
 *    is never truncated.
 *
 * The store is in-memory only (v1) — it resets on restart (boot lands on `/all`
 * anyway) and is cleared on account/context switch (`notes.resetView`).
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { nextTick } from "vue";
import { router } from "@/router";
import { goToCollection } from "@/utils/collection-nav";
import { useNotesStore } from "@/stores/notes";
import { useCollectionsStore, type CollectionType } from "@/stores/collections";
import { useColorsStore } from "@/stores/colors";
import { useEditorLayoutStore, type AttachmentTabAttrs } from "@/stores/editor-layout";
import { useDailyNotesStore } from "@/stores/daily-notes";

/** A restorable snapshot of "where the user is". `groupId` + `tab.id` are
 *  hints (fast path); the durable fallback keys are `noteId` /
 *  `attachment.hash` / `searchQuery`. `tasksFilterActive` is captured
 *  explicitly so `restore()` is route-aware and the Tasks/Daily views'
 *  `onMounted` hooks become idempotent (no flash, exact dedup). */
export interface NavTarget {
  /** Router path: `/all`, `/daily`, `/tasks`, `/archive`, `/trash`, `/monographs`, `/reminders`. */
  route: string;
  collection: { type: CollectionType; id: string } | null;
  tasksFilterActive: boolean;
  /** Captured only when `route === "/daily"` (the daily timeline's selected date). */
  dailyDate?: string;
  /** Focused pane — hint only (goes stale on pane close/re-home). Not in `identityOf`. */
  groupId: string;
  tab: {
    kind: "note" | "attachment" | "search";
    id: string;
    noteId?: string;
    attachment?: AttachmentTabAttrs;
    searchQuery?: string;
  } | null;
}

/** Maximum stack depth (oldest dropped when exceeded). */
const MAX_STACK = 200;

export const useNavHistoryStore = defineStore("nav-history", () => {
  const stack = ref<NavTarget[]>([]);
  const index = ref(-1);
  /** >0 while `restore()` is mutating state — the capture watcher/push ignores. */
  const suppress = ref(0);
  /** >0 inside a `beginBatch`/`endBatch` — `push` defers into `pendingCapture`. */
  const batchDepth = ref(0);
  /** The deferred capture set during a batch; `endBatch` flushes (or drops) it. */
  const pendingCapture = ref<NavTarget | null>(null);
  /** Identity captured at `beginBatch({ dropIfUnchanged: true })` so `endBatch`
   *  can drop the pending capture when a layout op (split/move/resize) changed
   *  only geometry, not the navigable state. */
  let preBatchIdentity: string | null = null;

  const canBack = computed(() => index.value > 0);
  const canForward = computed(() => index.value < stack.value.length - 1);
  const current = computed(() => (index.value >= 0 ? stack.value[index.value] ?? null : null));

  // --- snapshot + identity --------------------------------------------------

  /** Snapshot the active tab into the `NavTarget.tab` shape (or `null`). */
  function snapshotTab(): NavTarget["tab"] {
    const layout = useEditorLayoutStore();
    const tab = layout.activeTab;
    if (!tab) return null;
    return {
      kind: tab.kind,
      id: tab.id,
      ...(tab.noteId !== undefined ? { noteId: tab.noteId } : {}),
      ...(tab.attachment !== undefined ? { attachment: tab.attachment } : {}),
      ...(tab.searchQuery !== undefined ? { searchQuery: tab.searchQuery } : {})
    };
  }

  /** Read the full navigable state into a `NavTarget`. */
  function snapshotCurrent(): NavTarget {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    const daily = useDailyNotesStore();
    const route = router.currentRoute.value.path;
    const cf = notes.collectionFilter;
    return {
      route,
      collection: cf ? { type: cf.type, id: cf.id } : null,
      tasksFilterActive: notes.tasksFilterActive,
      ...(route === "/daily" ? { dailyDate: daily.selectedDate } : {}),
      groupId: layout.activeGroupId,
      tab: snapshotTab()
    };
  }

  /** The dedup key — excludes `groupId` + `tab.id` (unstable on close/re-home;
   *  including them would make a stale-groupId restore push and truncate the
   *  forward stack). Two targets with the same identity are "the same place". */
  function identityOf(t: NavTarget): string {
    const tab = t.tab;
    const tabKey = tab
      ? `${tab.kind}:${tab.noteId ?? ""}:${tab.attachment?.hash ?? ""}:${tab.searchQuery ?? ""}`
      : "null";
    const colKey = t.collection ? `${t.collection.type}:${t.collection.id}` : "null";
    return `${t.route}|${colKey}|${t.tasksFilterActive}|${t.dailyDate ?? ""}|${tabKey}`;
  }

  // --- push / batch ---------------------------------------------------------

  /** Push a navigation entry (called by the capture watcher). Dedups against
   *  the current top by identity (normalising its hints), truncates the forward
   *  stack on a genuine new place, and caps depth. No-ops while suppressed. */
  function push(target: NavTarget): void {
    if (suppress.value > 0) return;
    if (batchDepth.value > 0) {
      pendingCapture.value = target; // last write wins
      return;
    }
    commitPush(target);
  }

  /** The actual append/replace, bypassing the suppress/batch gates. */
  function commitPush(target: NavTarget): void {
    if (stack.value.length > 0 && index.value >= 0) {
      const top = stack.value[index.value]!;
      if (identityOf(top) === identityOf(target)) {
        // Same place — refresh the hints only (the tab.id/groupId may have
        // changed, e.g. after a restore reopened a closed note in a new tab).
        stack.value[index.value] = { ...top, groupId: target.groupId, tab: target.tab };
        return;
      }
    }
    // Truncate any forward stack (standard browser behaviour on a new nav).
    const truncated = stack.value.slice(0, index.value + 1);
    truncated.push(target);
    if (truncated.length > MAX_STACK) truncated.shift();
    stack.value = truncated;
    index.value = truncated.length - 1;
  }

  /** Flush a deferred batch capture (called by `endBatch`). */
  function flushPending(): void {
    const pending = pendingCapture.value;
    pendingCapture.value = null;
    if (pending && suppress.value === 0) commitPush(pending);
  }

  /** Begin a coalescing batch. With `dropIfUnchanged`, `endBatch` drops the
   *  pending capture when its identity equals the pre-batch identity — used by
   *  pure-layout ops (split/move/resize) so they don't pollute the stack. */
  function beginBatch(opts?: { dropIfUnchanged?: boolean }): void {
    batchDepth.value++;
    if ((opts?.dropIfUnchanged ?? false) && batchDepth.value === 1) {
      preBatchIdentity = identityOf(snapshotCurrent());
    }
  }

  /** End a coalescing batch; flush (or drop) the deferred capture. */
  function endBatch(opts?: { dropIfUnchanged?: boolean }): void {
    if (batchDepth.value > 0) batchDepth.value--;
    if (batchDepth.value > 0) return; // nested — wait for the outer end
    if (opts?.dropIfUnchanged && preBatchIdentity !== null && pendingCapture.value) {
      if (identityOf(pendingCapture.value) === preBatchIdentity) {
        pendingCapture.value = null; // geometry-only change — not a navigation
      }
    }
    preBatchIdentity = null;
    flushPending();
  }

  // --- restore --------------------------------------------------------------

  /** Best-effort existence check for a collection (so restoring a deleted
   *  notebook/tag falls back to `/all` clean instead of a blank list). Colors
   *  are not validated (rare mid-session deletion; an empty list is tolerable). */
  function collectionExists(type: CollectionType, id: string): boolean {
    const collections = useCollectionsStore();
    if (type === "notebook") return collections.notebooks.some((n) => n.id === id);
    if (type === "tag") return collections.tags.some((t) => t.id === id);
    if (type === "color") {
      const colors = useColorsStore();
      return colors.favorites.some((c) => c.id === id);
    }
    return true;
  }

  /** Best-effort existence check for a note id (excludes trashed/archived —
   *  those aren't restorable in the normal editor surface). */
  function noteExists(noteId: string): boolean {
    const notes = useNotesStore();
    return notes.items.some((n) => n.id === noteId);
  }

  /** Correct a target for stale/deleted references before restoring. A
   *  deleted/trashed note → drop the tab (restore view + collection only, leave
   *  the current tab in place). A deleted collection → drop the collection
   *  (restore `/all` clean). Stale groupId/tabId are kept (restore falls back
   *  by durable key). Never returns null — routes are always restorable. */
  function validateTarget(target: NavTarget): NavTarget {
    const corrected: NavTarget = { ...target, tab: target.tab ? { ...target.tab } : null };
    if (corrected.tab?.kind === "note" && corrected.tab.noteId && !noteExists(corrected.tab.noteId)) {
      corrected.tab = null; // trashed/deleted — leave the current tab in place
    }
    if (corrected.collection && !collectionExists(corrected.collection.type, corrected.collection.id)) {
      corrected.collection = null; // deleted notebook/tag/color → /all clean
      corrected.tasksFilterActive = false;
    }
    return corrected;
  }

  /** Apply a target to the live stores (route + collection + daily + group + tab). */
  async function doRestore(t: NavTarget): Promise<void> {
    const notes = useNotesStore();
    const collections = useCollectionsStore();
    const layout = useEditorLayoutStore();
    const daily = useDailyNotesStore();

    // Daily date FIRST (when restoring /daily) so the view's `immediate`
    // `watch(selectedDate)` opens the right note on mount rather than today's.
    if (t.route === "/daily" && t.dailyDate) daily.setSelectedDate(t.dailyDate);

    if (t.collection && collectionExists(t.collection.type, t.collection.id)) {
      // goToCollection routes to /all + sets the filter + the sidebar selection.
      await goToCollection(t.collection.type, t.collection.id);
      notes.setTasksFilterActive(false);
    } else {
      // No collection: clear filters + route to the target view. Set
      // tasksFilterActive explicitly so /tasks restores correctly and the
      // Tasks/Daily onMounted hooks are idempotent (no flash, exact dedup).
      notes.clearCollectionFilter();
      collections.clearSelection();
      notes.setTasksFilterActive(t.tasksFilterActive);
      await router.push(t.route);
    }

    // Group: fall back to the focused/first surviving group when the hint is stale.
    const gid = layout.groups[t.groupId]
      ? t.groupId
      : layout.activeGroupId || Object.keys(layout.groups)[0] || "";
    if (gid) layout.setActiveGroup(gid);

    // Tab: fast path if the hint still exists; else restore by durable key.
    if (t.tab) {
      if (layout.tabs[t.tab.id]) {
        layout.activateTab(t.tab.id);
      } else if (t.tab.kind === "note" && t.tab.noteId) {
        layout.openNote(t.tab.noteId);
      } else if (t.tab.kind === "attachment" && t.tab.attachment) {
        layout.openAttachmentTab(gid || layout.activeGroupId, t.tab.attachment);
      } else if (t.tab.kind === "search" && t.tab.searchQuery) {
        layout.openSearchTab(t.tab.searchQuery);
      }
    }
  }

  /** Step to `newIndex` and restore its target under a suppress guard. */
  async function restoreAt(newIndex: number): Promise<void> {
    const target = stack.value[newIndex];
    if (!target) return;
    suppress.value++;
    try {
      await doRestore(validateTarget(target));
      await nextTick();
      // Normalise the entry's hints to the resolved group/tab so a subsequent
      // identical navigation dedups (the reopened note has a fresh tabId).
      const layout = useEditorLayoutStore();
      stack.value[newIndex] = {
        ...stack.value[newIndex]!,
        groupId: layout.activeGroupId,
        tab: snapshotTab()
      };
    } finally {
      suppress.value--;
    }
  }

  function back(): void {
    if (!canBack.value) return;
    index.value--;
    void restoreAt(index.value);
  }

  function forward(): void {
    if (!canForward.value) return;
    index.value++;
    void restoreAt(index.value);
  }

  /** Clear the stack (account/context switch, lock). */
  function clear(): void {
    stack.value = [];
    index.value = -1;
    pendingCapture.value = null;
    batchDepth.value = 0;
    preBatchIdentity = null;
  }

  return {
    stack,
    index,
    canBack,
    canForward,
    current,
    snapshotCurrent,
    push,
    beginBatch,
    endBatch,
    back,
    forward,
    clear
  };
});