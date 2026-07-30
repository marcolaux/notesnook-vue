<script setup lang="ts">
/**
 * Per-pane editor tab strip (Phase 4.2/4.3) — rendered at the top of each
 * `EditorPane`. Parameterised by `groupId`: it shows that group's tabs (from
 * the layout store) and activates/closes/reorders within that group. Self-
 * contained: it owns all the drag/reorder/move/tear-off logic.
 *
 * Drag payload (HTML5 DnD): the source strip writes
 * `{tabId, groupId, noteId}` (JSON) under a custom MIME type on `dragstart`.
 * Any strip's `dragover` detects a tab drag via `dataTransfer.types` (so a
 * drop on a DIFFERENT pane's strip is accepted — the drag state is not local),
 * and `drop` reads the payload:
 *  - same group → within-strip reorder (`layout.reorderTab`);
 *  - different group → `layout.moveTab` into this group, then `reorderTab` to
 *    the drop position (insert before/after the hovered tab, or append).
 *
 * Note drags from the notes list (`application/x-notesnook-note`, payload
 * `{ids}`) are also accepted on the per-tab handlers and the empty strip:
 * every dragged note is opened as a tab in this group, inserted at the cursor
 * position (before/after the hovered tab, or appended at the end for the empty
 * strip). A note that already has a tab is MOVED into this group (if it was in
 * another) and reordered to the cursor — so a drag actually relocates the
 * already-open note's tab, mirroring tab-reorder. One tab per note is preserved
 * (the tab changes group, not duplicated). `markNoteDropHandled` is set so the
 * source row's `dragend` skips the cross-window tear-off.
 *
 * Tab cross-window move + tear-off (multi-window): HTML5 `dataTransfer` does
 * NOT cross Electron windows, so a drop on ANOTHER window's tab bar / drop zone
 * is invisible to it — the within-window drop handlers never fire there. The
 * cross-window move is therefore routed through the main process from the
 * source's `dragend` (`desktop.window.releaseTab`): main reads the live cursor
 * via `screen.getCursorScreenPoint()` + every window's OS bounds (`dragend`'s
 * `screenX/screenY` are unreliable on macOS when the drop lands on a native
 * surface like Finder) and resolves the release:
 *  - cursor over a DIFFERENT app window → forward `app:open-note` to it (it opens
 *    the note as a tab in its active group) — a cross-window MOVE;
 *  - cursor outside every window → tear the tab off into a new note window
 *    (focus mode, same note);
 *  - cursor back inside the source window → none (the renderer handled it).
 * Move semantics: the source tab closes for both `moved` and `toreOff`. A
 * within-window reorder/move/split consumed by a drop target sets
 * `dropEffect === "move"` in `dragend` → `releaseTab` is skipped entirely.
 *
 * The root is `titlebar-no-drag` so the tabs are interactive (click/drag)
 * inside the otherwise-draggable title bar, and `overflow-x-auto` so many tabs
 * scroll.
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useNotesStore } from "@/stores/notes";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useContextMenuStore } from "@/stores/context-menu";
import { useHorizontalWheelScroll } from "@/composables/use-horizontal-wheel-scroll";
import { separator, type MenuItem } from "@/utils/context-menu";
import { desktop } from "@/platform/desktop-bridge";
import { readCurrentContext } from "@/platform/account-context";
import { Icon } from "@notesnook-vue/ui-vue";
import {
  TAB_MIME,
  isTabDrag,
  readTabPayload,
  writeTabPayload,
  markTabDropHandled,
  consumeTabDropHandled,
  resetTabDropHandled
} from "@/utils/tab-dnd";
import {
  isNoteDrag,
  readNotePayload,
  markNoteDropHandled
} from "@/utils/note-dnd";
import {
  writePanePayload,
  consumePaneDropHandled,
  resetPaneDropHandled
} from "@/utils/pane-dnd";

const props = defineProps<{ groupId: string }>();
const notes = useNotesStore();
const layout = useEditorLayoutStore();
const { t: $t } = useI18n();

// Translate vertical wheel into horizontal scroll on the (overflow-x-auto) strip.
const stripRef = ref<HTMLElement | null>(null);
useHorizontalWheelScroll(stripRef);

/** This group's tabs, joined with titles for the strip. Attachment tabs use
 *  their filename as the title (no note lookup). */
const tabs = computed(() =>
  layout.tabsOf(props.groupId).map((t) => ({
    id: t.id,
    kind: t.kind,
    noteId: t.noteId ?? "",
    title:
      t.kind === "attachment"
        ? (t.attachment?.filename ?? $t("tabs.attachment"))
        : t.kind === "search"
          ? $t("tabs.searchTitle", { query: t.searchQuery ?? "" })
          : (notes.items.find((n) => n.id === t.noteId)?.title ?? $t("common.untitled"))
  }))
);
const activeTabId = computed<string | null>(
  () => layout.groups[props.groupId]?.activeTabId ?? null
);
/** Whether this strip's pane is the focused pane. The focused pane's active
 *  tab gets the full-intensity "paper" surface (`.editor-tab-active`, which
 *  blends into the focused editor below); an inactive pane's active tab gets
 *  the same paper at half intensity (`.editor-tab-inactive`) so it still
 *  blends into its (de-emphasised) editor. */
const isPaneFocused = computed(() => layout.activeGroupId === props.groupId);
const contextMenu = useContextMenuStore();

// --- Pane detach (Phase 4.6) ------------------------------------------------
/** Whether this pane has any portable tabs (note/attachment) — the grip +
 *  "Detach pane" action are only meaningful then. Search-only / empty panes
 *  have nothing to detach. */
const canDetachPane = computed(() =>
  layout.tabsOf(props.groupId).some((t) => t.kind !== "search")
);

/** Start screen position of an in-flight pane-grip drag (source strip only).
 *  Null when no grip drag started here. Used by `dragend` to decide tear-off /
 *  cross-window move via `releasePane`. */
const paneDragStart = ref<{ x: number; y: number } | null>(null);

/**
 * Detach this pane into its own window (command / context-menu path). Captures
 * the pane's snapshot, asks main to open a pane window for it, then closes the
 * pane here (the snapshot carries the tabs; `closeGroup` drops them from the
 * source + collapses the split). No-op when the pane has no portable tabs.
 */
function detachPane(): void {
  const snapshot = layout.detachGroupSnapshot(props.groupId);
  if (!snapshot) return;
  const contextId = readCurrentContext();
  void desktop.window.openPaneWindow.mutate({ snapshot, contextId });
  layout.closeGroup(props.groupId, true);
}

/** Grip `dragstart`: write the pane payload + record the start screen position
 *  so `dragend` can hand it to `releasePane` for geometry resolution. */
function onGripDragStart(e: DragEvent): void {
  writePanePayload(e, { groupId: props.groupId });
  resetPaneDropHandled();
  const screenX = window.screenX + e.clientX;
  const screenY = window.screenY + e.clientY;
  paneDragStart.value = { x: screenX, y: screenY };
}

/** Grip `dragend`: if no within-window target consumed the drop, ask main to
 *  resolve the release (move onto another window / tear off into a new pane
 *  window). The pane is closed here only when a move/tear-off actually
 *  happened (the snapshot was carried to the target / new window first). */
async function onGripDragEnd(_e: DragEvent): Promise<void> {
  const start = paneDragStart.value;
  paneDragStart.value = null;
  if (!start) return;
  // No within-window pane drop targets exist, so this is only false if a future
  // target set the flag; otherwise proceed to cross-window resolution.
  if (consumePaneDropHandled()) return;
  const snapshot = layout.detachGroupSnapshot(props.groupId);
  if (!snapshot) return;
  try {
    const res = await desktop.window.releasePane.mutate({
      snapshot,
      groupId: props.groupId,
      startScreenX: start.x,
      startScreenY: start.y
    });
    if (res.action === "moved" || res.action === "toreOff") layout.closeGroup(props.groupId, true);
  } catch {
    // Main unreachable (e.g. tests) — leave the pane in place.
  }
}

/** Open a single note tab in its own window (the menu equivalent of the tab
 *  drag tear-off): asks main to open a note window for it, then closes the
 *  source tab (move semantics — the note moves to the new window). Note tabs
 *  only; attachment/search tabs have no noteId. */
function openTabInNewWindow(tab: { id: string; noteId: string }): void {
  if (!tab.noteId) return;
  const contextId = readCurrentContext();
  void desktop.window.openNote.mutate({ noteId: tab.noteId, contextId });
  notes.closeTab(tab.id);
}

/** Copy an `nn://note/<id>` deep link for the tab's note to the clipboard.
 *  Note tabs only. */
function copyNoteLink(tab: { noteId: string }): void {
  if (!tab.noteId) return;
  void navigator.clipboard.writeText(`nn://note/${tab.noteId}`).catch(() => {
    /* clipboard unavailable (tests / no focus) — ignore */
  });
}

/** Close every tab in this group EXCEPT `keepTabId`. */
function closeOtherTabs(keepTabId: string): void {
  for (const t of layout.tabsOf(props.groupId)) {
    if (t.id !== keepTabId) notes.closeTab(t.id);
  }
}

/** Close every tab in this group that comes AFTER `tabId` in strip order. */
function closeTabsToRight(tabId: string): void {
  const list = layout.tabsOf(props.groupId);
  const idx = list.findIndex((t) => t.id === tabId);
  if (idx < 0) return;
  for (const t of list.slice(idx + 1)) notes.closeTab(t.id);
}

/** Close every tab in this group. */
function closeAllTabsInPane(): void {
  for (const t of layout.tabsOf(props.groupId)) notes.closeTab(t.id);
}

/** Tab `contextmenu`: a per-tab action menu. The actions operate on the
 *  right-clicked tab (NOT necessarily the active one), so close-others /
 *  close-to-right are relative to where the user clicked. Note-only actions
 *  (copy link, open in new window) are hidden for attachment/search tabs. The
 *  pane-level "Detach pane to new window" is included here too so a tab
 *  right-click can pop the whole pane out without hunting for the grip. */
function onTabContextMenu(e: MouseEvent, tab: { id: string; kind: string; noteId: string }): void {
  e.preventDefault();
  e.stopPropagation();
  const list = layout.tabsOf(props.groupId);
  const idx = list.findIndex((t) => t.id === tab.id);
  const isNote = tab.kind === "note" && !!tab.noteId;
  const items: MenuItem[] = [
    { id: "close", label: $t("tabs.closeTab"), icon: "x", onSelect: () => notes.closeTab(tab.id) },
    {
      id: "close-others",
      label: $t("tabs.closeOthers"),
      disabled: list.length <= 1,
      onSelect: () => closeOtherTabs(tab.id)
    },
    {
      id: "close-right",
      label: $t("tabs.closeRight"),
      disabled: idx < 0 || idx >= list.length - 1,
      onSelect: () => closeTabsToRight(tab.id)
    },
    {
      id: "close-all",
      label: $t("tabs.closeAll"),
      disabled: list.length === 0,
      onSelect: () => closeAllTabsInPane()
    }
  ];
  if (isNote) {
    items.push(separator("sep-link"));
    items.push({
      id: "copy-link",
      label: $t("tabs.copyLink"),
      icon: "link",
      onSelect: () => copyNoteLink(tab)
    });
    items.push({
      id: "open-new-window",
      label: $t("tabs.openInNewWindow"),
      icon: "external-link",
      onSelect: () => openTabInNewWindow(tab)
    });
  }
  if (canDetachPane.value) {
    items.push(separator("sep-pane"));
    items.push({
      id: "detach-pane",
      label: $t("tabs.detachPane"),
      icon: "external-link",
      onSelect: () => detachPane()
    });
  }
  contextMenu.show(items, e.clientX, e.clientY);
}

/** Strip `contextmenu` (empty area only — tabs + grip stop propagation): the
 *  pane-level action menu. Offered even on an empty pane (New note / Split are
 *  always useful); "Detach pane" + "Close pane" appear only when meaningful. */
function onStripContextMenu(e: MouseEvent): void {
  e.preventDefault();
  const items: MenuItem[] = [
    {
      id: "new-note",
      label: $t("tabs.newNoteHere"),
      icon: "plus",
      onSelect: () => {
        layout.setActiveGroup(props.groupId);
        void notes.create();
      }
    },
    {
      id: "split-right",
      label: $t("tabs.splitRight"),
      icon: "panel-right",
      onSelect: () => {
        layout.setActiveGroup(props.groupId);
        layout.splitGroup("vertical");
      }
    },
    {
      id: "split-down",
      label: $t("tabs.splitDown"),
      icon: "panel-left",
      onSelect: () => {
        layout.setActiveGroup(props.groupId);
        layout.splitGroup("horizontal");
      }
    }
  ];
  if (canDetachPane.value) {
    items.push(separator("sep-detach"));
    items.push({
      id: "detach-pane",
      label: $t("tabs.detachPane"),
      icon: "external-link",
      onSelect: () => detachPane()
    });
  }
  if (layout.groupCount > 1) {
    items.push(separator("sep-close"));
    items.push({
      id: "close-pane",
      label: $t("tabs.closePane"),
      icon: "x",
      onSelect: () => layout.closeGroup(props.groupId)
    });
  }
  // Avoid an empty menu on a degenerate state (no items built).
  if (items.length === 0) return;
  contextMenu.show(items, e.clientX, e.clientY);
}

/** Start screen position of the in-flight drag (source strip only — used by
 *  `dragend` to decide tear-off). Null when no drag started here. */
const tabDragStart = ref<{ x: number; y: number; tabId: string; noteId: string } | null>(null);
/** Drop indicator: which tab the dragged tab would insert before/after. */
const tabDropTarget = ref<{ tabId: string; position: "before" | "after" } | null>(null);
/** Drop indicator: the dragged tab would drop at the end of the strip (into
 *  the empty space to the right of the last tab). Mutually exclusive with
 *  `tabDropTarget`. */
const dropAtEnd = ref(false);

function onTabDragStart(e: DragEvent, tab: { id: string; noteId: string }): void {
  // The JSON payload carries the source tab+group so a DIFFERENT pane's strip
  // (or pane body, for split-via-drop) can accept the drop — the drag state is
  // not local to this instance. `writeTabPayload` uses a custom MIME type (not
  // text/plain) so the OS doesn't treat the drag as a text/URL drag into other
  // apps (Finder etc.).
  writeTabPayload(e, { tabId: tab.id, groupId: props.groupId, noteId: tab.noteId });
  // Clear stale handled state from any previous drag before this one starts.
  resetTabDropHandled();
  const screenX = window.screenX + e.clientX;
  const screenY = window.screenY + e.clientY;
  tabDragStart.value = { x: screenX, y: screenY, tabId: tab.id, noteId: tab.noteId };
}


/** Middle-click (button 1) closes a tab — the browser/VS Code convention. The
 *  regular `@click` only fires for the left button, so middle-click never
 *  triggers a tab select. `preventDefault` suppresses the OS middle-click
 *  defaults (autoscroll on some platforms, primary-paste on Linux). */
function onTabMouseDown(e: MouseEvent, tab: { id: string }): void {
  if (e.button !== 1) return;
  e.preventDefault();
  notes.closeTab(tab.id);
}

function onTabDragOver(e: DragEvent, tab: { id: string }): void {
  // Accept both tab drags (reorder/move) and note drags (open as a tab here).
  if (!isTabDrag(e) && !isNoteDrag(e)) return;
  // preventDefault is required to make this tab a valid drop target (so `drop`
  // fires and the OS doesn't swallow the drag into another app).
  e.preventDefault();
  // Stop the strip-level handler from also firing (it would mark a drop-at-end
  // while we're hovering a specific tab).
  e.stopPropagation();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  dropAtEnd.value = false;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const position = e.clientX < rect.left + rect.width / 2 ? "before" : "after";
  tabDropTarget.value = { tabId: tab.id, position };
}

function onTabDrop(e: DragEvent, targetTab: { id: string }): void {
  e.preventDefault();
  e.stopPropagation();
  // A within-window target consumed the drop → skip the source's cross-window
  // releaseTab. Mark the flag matching the drag kind (tab vs note source).
  if (isNoteDrag(e)) markNoteDropHandled();
  else markTabDropHandled();
  tabDropTarget.value = null;
  dropAtEnd.value = false;

  // Note drag → open every dragged note as a tab in this group, inserted at the
  // cursor position (before/after the hovered tab).
  if (isNoteDrag(e)) {
    const payload = readNotePayload(e);
    if (!payload) return;
    const targetIdx = tabs.value.findIndex((t) => t.id === targetTab.id);
    if (targetIdx < 0) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientX > rect.left + rect.width / 2;
    openNotesAt(after ? targetIdx + 1 : targetIdx, payload.ids);
    return;
  }

  const src = readTabPayload(e);
  if (!src.tabId) return;
  const list = tabs.value;
  const targetIdx = list.findIndex((t) => t.id === targetTab.id);
  if (targetIdx < 0) return;
  // Recompute before/after from the cursor (don't rely on the indicator state,
  // which was just cleared) — `toIndex` is the desired final index in this
  // group's tab list AFTER the source is removed.
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const after = e.clientX > rect.left + rect.width / 2;
  const toIndex = after ? targetIdx + 1 : targetIdx;
  moveOrReorder(src, toIndex);
}

/** Open each dragged note as a tab in this group at position `toIndex` (the
 *  desired final index of the FIRST tab; subsequent ones follow in order).
 *
 *  A note that already has a tab is RELOCATED here (moved into this group if it
 *  was in another, then reordered to the cursor) — so a drag actually moves the
 *  already-open note's tab to where you dropped it, mirroring tab-reorder. One
 *  tab per note is preserved (the tab changes group, not duplicated). A note
 *  with no tab yet is created in this group via `openTab` (appended), then
 *  reordered to the cursor. */
function openNotesAt(toIndex: number, ids: string[]): void {
  let idx = toIndex;
  for (const noteId of ids) {
    const existing = layout.tabForNote(noteId);
    let tabId: string | undefined;
    if (existing) {
      if (existing.groupId !== props.groupId) layout.moveTab(existing.id, props.groupId);
      tabId = existing.id;
    } else {
      tabId = layout.openTab(props.groupId, noteId);
    }
    if (!tabId) continue;
    layout.reorderTab(props.groupId, tabId, idx);
    idx++;
  }
}

/** Same-group → reorder; cross-group → move into this group then reorder to
 *  `toIndex`. `toIndex` is the desired final index in THIS group's tab list
 *  after the source is removed (clamped by the store). */
function moveOrReorder(
  src: { tabId?: string; groupId?: string },
  toIndex: number
): void {
  if (!src.tabId) return;
  if (src.groupId && src.groupId !== props.groupId) {
    layout.moveTab(src.tabId, props.groupId);
  }
  layout.reorderTab(props.groupId, src.tabId, toIndex);
}

/** Dragging into the empty space past the last tab drops the tab at the end of
 *  the strip. Only fires for the empty area — the per-tab handlers stop
 *  propagation when the pointer is over a tab. */
function onStripDragOver(e: DragEvent): void {
  if (!isTabDrag(e) && !isNoteDrag(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  tabDropTarget.value = null;
  dropAtEnd.value = true;
}

function onStripDrop(e: DragEvent): void {
  e.preventDefault();
  if (isNoteDrag(e)) markNoteDropHandled();
  else markTabDropHandled(); // a within-window target consumed the drop → skip releaseTab
  tabDropTarget.value = null;
  dropAtEnd.value = false;

  // Note drag → open every dragged note as a tab appended at the end of this
  // group's strip.
  if (isNoteDrag(e)) {
    const payload = readNotePayload(e);
    if (!payload) return;
    openNotesAt(tabs.value.length, payload.ids);
    return;
  }

  const src = readTabPayload(e);
  if (!src.tabId) return;
  // Append at the end of this group's tab list.
  const toIndex = tabs.value.length;
  moveOrReorder(src, toIndex);
}

/** Clear the drop indicators when the pointer truly leaves this strip (so a
 *  cross-pane drag that passes over this strip and then drops elsewhere
 *  doesn't leave a stale indicator). */
function onStripDragLeave(e: DragEvent): void {
  const related = e.relatedTarget as Node | null;
  const strip = e.currentTarget as HTMLElement;
  if (!related || !strip.contains(related)) {
    tabDropTarget.value = null;
    dropAtEnd.value = false;
  }
}

async function onTabDragEnd(e: DragEvent): Promise<void> {
  const start = tabDragStart.value;
  tabDragStart.value = null;
  tabDropTarget.value = null;
  dropAtEnd.value = false;
  if (!start) return;
  // A within-window drop (reorder/move/split) was consumed by one of the
  // window's drop handlers, which set the shared `tabDropHandled` flag. If so,
  // the renderer already handled it — do nothing. Only a drag that landed on NO
  // within-window drop target reaches here (it ended over another window or
  // outside every window). NOTE: we deliberately do NOT use
  // `dataTransfer.dropEffect === "move"` for this guard — `dropEffect` is sticky
  // from the last `dragover` inside the source window, so it stays `"move"` even
  // when the cursor leaves over a drop zone, which would falsely suppress the
  // cross-window move. HTML5 `dataTransfer` doesn't cross Electron windows, so
  // the cross-window move is routed through main: it resolves the target from
  // the live cursor + every window's OS bounds, then either forwards
  // `app:open-note` to that window (move) or tears off a new note window. Close
  // the source tab for both (move semantics).
  if (consumeTabDropHandled()) return;
  // Attachment tabs have no noteId and don't participate in cross-window
  // tear-off (which is note-centric: main forwards `app:open-note`). A
  // within-window move/reorder was already handled above; if the drag ended
  // outside every drop target, just leave the attachment tab in place.
  if (!start.noteId) return;
  try {
    const res = await desktop.window.releaseTab.mutate({
      noteId: start.noteId,
      startScreenX: start.x,
      startScreenY: start.y
    });
    if (res.action === "moved" || res.action === "toreOff") notes.closeTab(start.tabId);
  } catch {
    // Main unreachable (e.g. tests) — leave the tab in place.
  }
}
</script>

<template>
  <div
    ref="stripRef"
    class="titlebar-no-drag flex min-h-8 shrink-0 items-end gap-px overflow-x-auto border-b border-glass-border bg-glass-surface"
    @dragover="onStripDragOver($event)"
    @dragleave="onStripDragLeave($event)"
    @drop="onStripDrop($event)"
    @contextmenu="onStripContextMenu($event)"
  >
    <!-- Pane detach grip (Phase 4.6): drag outside the window to tear this whole
         pane off into a new window; drag onto another window to move it there.
         The pane-level context menu (right-click the EMPTY strip area) and the
         per-tab context menu both also offer "Detach pane to new window". Only
         shown when the pane has portable (note/attachment) tabs. -->
    <button
      v-if="canDetachPane"
      type="button"
      draggable="true"
      class="titlebar-no-drag flex shrink-0 cursor-grab items-center self-center px-1 text-text-muted opacity-60 hover:text-text hover:opacity-100"
      :title="$t('tabs.detachGripTitle')"
      @dragstart="onGripDragStart($event)"
      @dragend="onGripDragEnd($event)"
      @click.stop
      @contextmenu.stop.prevent
    >
      <Icon name="grip-vertical" :size="14" />
    </button>
    <div
      v-for="tab in tabs"
      :key="tab.id"
      draggable="true"
      class="group relative flex cursor-pointer items-center gap-1 border-r border-glass-border px-3 py-1.5 text-xs"
      :class="
        activeTabId === tab.id
          ? isPaneFocused
            ? 'editor-tab-active bg-glass-active text-text'
            : 'editor-tab-inactive bg-glass-active text-text'
          : 'bg-glass-surface text-text-muted hover:bg-glass-hover hover:text-text'
      "
      :title="$t('tabs.dragHint')"
      @click="layout.activateTab(tab.id)"
      @mousedown="onTabMouseDown($event, tab)"
      @contextmenu.stop="onTabContextMenu($event, tab)"
      @dragstart="onTabDragStart($event, tab)"
      @dragover="onTabDragOver($event, tab)"
      @drop="onTabDrop($event, tab)"
      @dragend="onTabDragEnd($event)"
    >
      <!-- Drop indicator: a 2px accent line on the side where the dragged
           tab would insert. -->
      <span
        v-if="tabDropTarget?.tabId === tab.id"
        class="pointer-events-none absolute top-0 h-full w-0.5 bg-[var(--accent)]"
        :class="tabDropTarget.position === 'before' ? 'left-0' : 'right-0'"
      />
      <span class="max-w-32 truncate">{{ tab.title }}</span>
      <button
        class="opacity-0 group-hover:opacity-100 hover:text-text"
        @click.stop="notes.closeTab(tab.id)"
        :title="$t('tabs.closeTab')"
      >
        ×
      </button>
    </div>
    <!-- Drop-at-end indicator: a 2px accent line at the end of the strip when
         the dragged tab would drop into the empty space past the last tab. -->
    <span
      v-if="dropAtEnd"
      class="pointer-events-none w-0.5 self-stretch shrink-0 bg-[var(--accent)]"
    />
  </div>
</template>