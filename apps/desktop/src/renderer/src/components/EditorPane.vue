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
 * The dragover/drop handlers are attached in the CAPTURE phase so the tab drag
 * is intercepted before the ProseMirror editor (which only handles FILE drops
 * and would otherwise set its own `dropEffect`), and `dropEffect = "move"` is set
 * authoritatively — so a drop anywhere on the pane never triggers a tear-off
 * (tear-off only happens when a tab drag lands on NO drop target). Non-tab
 * drags (files/images) fall through (`isTabDrag` false → no `preventDefault`,
 * no `stopPropagation`) so the editor's attachment drop keeps working.
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
import NoteTabs from "./NoteTabs.vue";
import Editor from "./Editor.vue";
import AttachmentPreview from "./AttachmentPreview.vue";
import SearchResultsPane from "./SearchResultsPane.vue";
import HistorySidebar from "./HistorySidebar.vue";

const props = defineProps<{ groupId: string }>();
const layout = useEditorLayoutStore();

const activeTabId = computed<string | null>(
  () => layout.groups[props.groupId]?.activeTabId ?? null
);
/** The active tab object (read for `kind` to dispatch Editor vs AttachmentPreview). */
const activeTab = computed(() => (activeTabId.value ? layout.tabs[activeTabId.value] ?? null : null));

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
  if (!isTabDrag(e)) return;
  // Capture + stopPropagation: intercept the tab drag before ProseMirror and
  // authoritatively set dropEffect="move" (no tear-off on a pane drop).
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  const z = zoneFromEvent(e);
  if (z) activeZone.value = z;
}

function onEditorDragLeave(e: DragEvent): void {
  if (!isTabDrag(e)) return;
  // Only clear when the pointer truly leaves the editor body (a child→child
  // hop keeps the indicator — `relatedTarget` is still contained).
  const related = e.relatedTarget as Node | null;
  const el = editorEl.value;
  if (!el) return;
  if (!related || !el.contains(related)) activeZone.value = null;
}

function onEditorDrop(e: DragEvent): void {
  if (!isTabDrag(e)) return;
  e.preventDefault();
  e.stopPropagation();
  markTabDropHandled(); // a within-window target consumed the drop → skip releaseTab
  const z = activeZone.value;
  activeZone.value = null;
  const src = readTabPayload(e);
  if (!src.tabId) return;
  if (z === "left" || z === "right" || z === "top" || z === "bottom") {
    layout.dropTabToSplit(props.groupId, src.tabId, z);
  } else {
    // centre (or no zone resolved) → move the tab into this pane (append).
    layout.moveTab(src.tabId, props.groupId);
  }
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
           `activeTabId` term narrows it to a non-null string for the prop. -->
      <HistorySidebar
        v-if="activeTab?.kind === 'note' && activeTab.historyVisible && activeTabId"
        :tab-id="activeTabId"
        class="w-80 shrink-0 border-l border-glass-border"
      />

      <!-- Drag-to-split zone overlay: only while a tab drag hovers this pane.
           `pointer-events-none` so it never intercepts clicks/editor input. -->
      <div v-if="activeZone" class="pointer-events-none absolute inset-0 z-10">
        <div
          v-if="activeZone === 'center'"
          class="absolute inset-[30%] rounded-md border-2 border-blue-400/70 bg-blue-400/10"
        />
        <div
          v-else-if="activeZone === 'left'"
          class="absolute inset-y-0 left-0 w-[30%] border-r-2 border-blue-400 bg-blue-400/15"
        />
        <div
          v-else-if="activeZone === 'right'"
          class="absolute inset-y-0 right-0 w-[30%] border-l-2 border-blue-400 bg-blue-400/15"
        />
        <div
          v-else-if="activeZone === 'top'"
          class="absolute inset-x-0 top-0 h-[30%] border-b-2 border-blue-400 bg-blue-400/15"
        />
        <div
          v-else-if="activeZone === 'bottom'"
          class="absolute inset-x-0 bottom-0 h-[30%] border-t-2 border-blue-400 bg-blue-400/15"
        />
      </div>
    </div>
  </div>
</template>