<script setup lang="ts">
/**
 * A single editor pane (Phase 4.2/4.3) — one leaf of the split-layout tree.
 *
 * Renders the pane's tab strip (`NoteTabs`, parameterised by `groupId`) above a
 * `KeepAlive`-wrapped `Editor` for the group's active tab. A group with no
 * active tab renders a *draft* `Editor` (empty + live) instead, so typing in a
 * freshly-split empty pane lazily creates a note there. The `Editor` is keyed
 * by `tabId` inside `<KeepAlive>` so switching tabs within the pane preserves
 * cursor/scroll/undo; the draft editor (keyed `"draft:"+groupId`) sits outside
 * `KeepAlive` (it's transient — it unmounts once a tab exists).
 *
 * Any `mousedown` in the pane focuses the group (`layout.setActiveGroup`) so
 * the side panels + status bar + command-palette editor channel follow the
 * pane the user clicked into.
 *
 * Drag-to-split drop zones (Phase 4.x): while a tab is being dragged over this
 * pane's editor body, a directional overlay highlights the edge the cursor is
 * in (left / right / top / bottom) or the centre. Dropping on an edge splits
 * this pane in that direction and moves the dragged tab into the new sibling
 * (`layout.dropTabToSplit`); dropping in the centre moves the tab into this
 * pane (`layout.moveTab`, append). The strip above handles its own
 * reorder/move/insert drops, so the zone overlay only covers the editor body.
 *
 * Note drags from the notes list are also accepted here: an edge drop splits
 * this pane (`layout.splitGroupAt`) and moves/opens every dragged note into
 * the new sibling; a centre drop moves/opens them into this pane. A note that
 * already has a tab is MOVED to the target (`layout.moveTab`) rather than
 * duplicated, so dragging the currently-active note to a split actually
 * relocates it (no empty sibling left behind); a note with no tab is created
 * there via `layout.openTab`. One tab per note is preserved throughout.
 *
 * The dragover/drop handlers are attached in the CAPTURE phase so the drag is
 * intercepted before the ProseMirror editor (which only handles FILE drops
 * and would otherwise set its own `dropEffect`), and `dropEffect = "move"` is
 * set authoritatively — so a drop anywhere on the pane never triggers a
 * tear-off (tear-off only happens when a tab drag lands on NO drop target).
 * Non-handled drags (files/images) fall through (`isTabDrag`/`isNoteDrag`
 * false → no `preventDefault`, no `stopPropagation`) so the editor's
 * attachment drop keeps working.
 */
import { computed, ref } from "vue";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import {
  isTabDrag,
  readTabPayload,
  markTabDropHandled,
  dropZoneFromPoint,
  type DropZone
} from "@/utils/tab-dnd";
import { isNoteDrag, readNotePayload, markNoteDropHandled } from "@/utils/note-dnd";
import NoteTabs from "./NoteTabs.vue";
import Editor from "./Editor.vue";
import AttachmentPreview from "./AttachmentPreview.vue";
import SearchResultsPane from "./SearchResultsPane.vue";
import HistorySidebar from "./HistorySidebar.vue";
import TocSidebar from "./TocSidebar.vue";

const props = defineProps<{ groupId: string }>();
const layout = useEditorLayoutStore();

const activeTabId = computed<string | null>(
  () => layout.groups[props.groupId]?.activeTabId ?? null
);
/** The active tab object (read for `kind` to dispatch Editor vs AttachmentPreview). */
const activeTab = computed(() => (activeTabId.value ? layout.tabs[activeTabId.value] ?? null : null));
/** Whether this pane is the focused one — drives the editor-body surface so
 *  the area behind the right sidebar matches the active editor/tab surface
 *  (`.editor-pane-surface`/`.editor-pane-inactive`), not the raw shell. */
const isPaneFocused = computed(() => layout.activeGroupId === props.groupId);

// --- Drag-to-split drop zones -----------------------------------------------
const editorEl = ref<HTMLElement | null>(null);
/** The zone under the cursor while a tab drag hovers this pane (null when no
 *  tab drag is over it). Drives the highlight overlay. */
const activeZone = ref<DropZone | null>(null);

function zoneFromEvent(e: DragEvent): DropZone | null {
  const el = editorEl.value;
  if (!el) return null;
  return dropZoneFromPoint(e.clientX, e.clientY, el.getBoundingClientRect());
}

function onEditorDragOver(e: DragEvent): void {
  // Accept tab drags (split/move) and note drags (open the note here); let
  // file/image drags fall through to the editor's attachment drop.
  if (!isTabDrag(e) && !isNoteDrag(e)) return;
  // Capture + stopPropagation: intercept the drag before ProseMirror and
  // authoritatively set dropEffect="move" (no tear-off on a pane drop).
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  const z = zoneFromEvent(e);
  if (z) activeZone.value = z;
}

function onEditorDragLeave(e: DragEvent): void {
  if (!isTabDrag(e) && !isNoteDrag(e)) return;
  // Only clear when the pointer truly leaves the editor body (a child→child
  // hop keeps the indicator — `relatedTarget` is still contained).
  const related = e.relatedTarget as Node | null;
  const el = editorEl.value;
  if (!el) return;
  if (!related || !el.contains(related)) activeZone.value = null;
}

function onEditorDrop(e: DragEvent): void {
  if (!isTabDrag(e) && !isNoteDrag(e)) return;
  e.preventDefault();
  e.stopPropagation();
  const z = activeZone.value;
  activeZone.value = null;

  // Note drag → relocate every dragged note into the target: edge zone splits
  // this pane and moves/opens them in the new sibling; centre moves/opens them
  // as tabs in this pane. A note that already has a tab is MOVED (not duplicated)
  // so a drag actually relocates the already-open note — mirroring tab drag.
  if (isNoteDrag(e)) {
    const payload = readNotePayload(e);
    if (!payload) return;
    markNoteDropHandled(); // within-window target consumed the drop → skip releaseTab
    if (z === "left" || z === "right" || z === "top" || z === "bottom") {
      const vertical = z === "left" || z === "right";
      const position = z === "right" || z === "bottom" ? "after" : "before";
      const newGroupId = layout.splitGroupAt(
        props.groupId,
        vertical ? "vertical" : "horizontal",
        position
      );
      // Split failed (group vanished mid-drop) → fall back to this pane so the
      // drop isn't lost.
      const intoGroupId = newGroupId || props.groupId;
      for (const noteId of payload.ids) moveOrCreateTab(noteId, intoGroupId);
    } else {
      // centre (or no zone resolved) → move/open as tabs in this pane.
      for (const noteId of payload.ids) moveOrCreateTab(noteId, props.groupId);
    }
    return;
  }

  markTabDropHandled(); // a within-window target consumed the drop → skip releaseTab
  const src = readTabPayload(e);
  if (!src.tabId) return;
  if (z === "left" || z === "right" || z === "top" || z === "bottom") {
    layout.dropTabToSplit(props.groupId, src.tabId, z);
  } else {
    // centre (or no zone resolved) → move the tab into this pane (append).
    layout.moveTab(src.tabId, props.groupId);
  }
}

/** Move an existing tab for `noteId` into `targetGroupId`, or create a new tab
 *  there if the note isn't open yet. Preserves one-tab-per-note (the tab changes
 *  group, not duplicated) and lets a note drag relocate an already-open note's
 *  tab to the drop target instead of leaving an empty split sibling behind. */
function moveOrCreateTab(noteId: string, targetGroupId: string): void {
  const existing = layout.tabForNote(noteId);
  if (existing) {
    if (existing.groupId !== targetGroupId) layout.moveTab(existing.id, targetGroupId);
    return;
  }
  layout.openTab(targetGroupId, noteId);
}
</script>

<template>
  <div
    class="flex min-h-0 min-w-0 flex-1 flex-col"
    :data-pane-group="props.groupId"
    @mousedown="layout.setActiveGroup(props.groupId)"
  >
    <NoteTabs :group-id="props.groupId" />
    <div
      ref="editorEl"
      data-editor-body=""
      class="relative flex min-h-0 min-w-0 flex-1"
      :class="isPaneFocused ? 'editor-pane-surface' : 'editor-pane-inactive'"
      @dragover.capture="onEditorDragOver($event)"
      @dragleave="onEditorDragLeave($event)"
      @drop.capture="onEditorDrop($event)"
    >
      <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <!-- Note + attachment tabs: cached under KeepAlive (cursor/scroll/undo
             + attachment scroll preserved across tab switches). Search tabs
             are excluded (they re-read from the search cache on mount; caching
             would pin a stale result set). -->
        <KeepAlive v-if="activeTabId && activeTab?.kind !== 'search'" :max="12">
          <component
            :is="activeTab?.kind === 'attachment' ? AttachmentPreview : Editor"
            :key="activeTab?.kind === 'attachment' ? 'att:' + activeTabId : activeTabId"
            :tab-id="activeTabId"
          />
        </KeepAlive>
        <SearchResultsPane
          v-else-if="activeTabId && activeTab?.kind === 'search'"
          :key="'search:' + activeTabId"
          :tab-id="activeTabId"
        />
        <Editor v-else :key="'draft:' + props.groupId" :group-id="props.groupId" />
      </div>

      <!-- Per-tab note-history timeline sidebar (note tabs only). The
           `activeTabId` term narrows it to a non-null string for the prop.
           Wrapped in a slide+fade `<Transition>` so opening/closing animates. -->
      <Transition name="right-sidebar">
        <HistorySidebar
          v-if="activeTab?.kind === 'note' && activeTab.historyVisible && activeTabId"
          :tab-id="activeTabId"
          class="my-2 mr-2 w-80 shrink-0"
        />
      </Transition>

      <!-- Per-tab ToC/Minimap/Visualizer right sidebar (note tabs only). Floating
           rounded glass panel (the shell handles its own edges/blur), so it gets a
           small margin + no flat border-l. Slide+fade transition on open/close.
           Minimap is narrower (w-40); ToC and the per-note visualizer use w-80. -->
      <Transition name="right-sidebar">
        <TocSidebar
          v-if="activeTab?.kind === 'note' && activeTab.tocVisible && activeTabId"
          :tab-id="activeTabId"
          class="my-2 mr-2 shrink-0 transition-[width] duration-200 ease-in-out"
          :class="activeTab?.tocMode === 'minimap' ? 'w-40' : 'w-80'"
        />
      </Transition>

      <!-- Drag-to-split zone overlay: only while a tab drag hovers this pane.
           `pointer-events-none` so it never intercepts clicks/editor input. -->
      <div v-if="activeZone" class="pointer-events-none absolute inset-0 z-10">
        <div
          v-if="activeZone === 'center'"
          class="absolute inset-[30%] rounded-md border-2 border-[color-mix(in_srgb,var(--accent)_70%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
        />
        <div
          v-else-if="activeZone === 'left'"
          class="absolute inset-y-0 left-0 w-[30%] border-r-2 border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]"
        />
        <div
          v-else-if="activeZone === 'right'"
          class="absolute inset-y-0 right-0 w-[30%] border-l-2 border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]"
        />
        <div
          v-else-if="activeZone === 'top'"
          class="absolute inset-x-0 top-0 h-[30%] border-b-2 border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]"
        />
        <div
          v-else-if="activeZone === 'bottom'"
          class="absolute inset-x-0 bottom-0 h-[30%] border-t-2 border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]"
        />
      </div>
    </div>
  </div>
</template>