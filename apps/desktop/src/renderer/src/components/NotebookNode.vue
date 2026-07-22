<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { Icon } from "@notesnook-vue/ui-vue";
import { useCollectionsStore } from "@/stores/collections";
import { useNotesStore } from "@/stores/notes";
import { usePropertiesStore } from "@/stores/properties";
import { useShortcutsStore } from "@/stores/shortcuts";
import { useContextMenuStore } from "@/stores/context-menu";
import { useDialogStore } from "@/stores/dialog";
import { useNotebookIconsStore } from "@/stores/notebook-icons";
import { useIconDialogStore } from "@/stores/icon-dialog";
import { buildNotebookMenu, type NotebookMenuTarget } from "@/utils/context-menu-entries";
import type { NotebookTreeNode } from "@/utils/collections";
import {
  isSidebarDrag,
  readSidebarPayload,
  writeSidebarPayload
} from "@/utils/sidebar-order";
import { isNoteDrag, readNotePayload, markNoteDropHandled } from "@/utils/note-dnd";

defineOptions({ name: "NotebookNode" });

const props = defineProps<{
  node: NotebookTreeNode;
  depth: number;
}>();

const collections = useCollectionsStore();
const notes = useNotesStore();
const properties = usePropertiesStore();
const shortcuts = useShortcutsStore();
const contextMenu = useContextMenuStore();
const dialog = useDialogStore();
const notebookIcons = useNotebookIconsStore();
const iconDialog = useIconDialogStore();
const router = useRouter();
const { t } = useI18n();

const renameInput = ref<HTMLInputElement | null>(null);

/** Only root notebooks (depth 0) are drag-reorderable in the sidebar — sub-
 *  notebooks keep the column sort (a per-parent manual order is a follow-up).
 *  Depth gating also keeps a sub-notebook row from acting as a drop target. */
const canReorder = computed(() => props.depth === 0);

/** Drop indicator for this row: where the dragged root notebook would insert
 *  (`before` = blue line at the top, `after` = at the bottom). Per-instance so
 *  only the hovered row shows a marker; cleared on `dragleave`/`drop`. Mirrors
 *  the editor tab drop indicator (`NoteTabs.vue`). */
const dropTarget = ref<{ position: "before" | "after" } | null>(null);

/** Whole-row highlight when a note drag hovers this row (an assignment, not a
 *  positional insert — so a ring, not the reorder insertion line). Cleared on
 *  `dragleave`/`drop`. Per-instance so only the hovered row shows a marker. */
const noteDropOver = ref(false);

/** Is this notebook the currently-selected collection? */
function isSelected(): boolean {
  return collections.selected?.type === "notebook" && collections.selected.id === props.node.item.id;
}

/** Is this row currently in inline-rename mode? */
const isRenaming = computed(
  () =>
    collections.renaming?.kind === "notebook" && collections.renaming.id === props.node.item.id
);

/** Select the notebook, restrict the notes list to it (descendants included
 *  via `db.notebooks.notes`), and show the notes view. */
async function select(): Promise<void> {
  if (isRenaming.value) return; // don't navigate while renaming
  collections.select("notebook", props.node.item.id);
  await notes.filterByCollection("notebook", props.node.item.id);
  void router.push("/all");
}

/** Pin/unpin this notebook as a sidebar shortcut (db.shortcuts). */
function toggleShortcut(): void {
  void shortcuts.toggle(props.node.item.id, "notebook");
}

/** Create a sub-notebook under this notebook + expand to reveal it. */
function createSubNotebook(): void {
  void collections.createSubNotebook(props.node.item.id);
}

/** Right-click → notebook context menu at the cursor. */
function onContext(e: MouseEvent): void {
  if (isRenaming.value) return;
  const target: NotebookMenuTarget = {
    id: props.node.item.id,
    title: props.node.item.title,
    pinned: props.node.item.pinned,
    icon: notebookIcons.icons[props.node.item.id] ?? null
  };
  const entries = buildNotebookMenu(target, {
    createSubNotebook,
    toggleShortcut: (id) => void shortcuts.toggle(id, "notebook"),
    isShortcut: (id) => shortcuts.isShortcut(id),
    togglePinnedToTop: (id) => void collections.toggleNotebookPinned(id),
    rename: (id, title) => {
      collections.startRename("notebook", id, title);
      // Focus the inline input once it renders.
      void nextTick().then(() => renameInput.value?.focus());
    },
    setIcon: async (id) => {
      const result = await iconDialog.openPicker(notebookIcons.icons[id]);
      if (result) notebookIcons.setIcon(id, result.icon);
    },
    removeIcon: (id) => notebookIcons.removeIcon(id),
    confirm: (opts) => dialog.confirm(opts),
    deleteNotebook: (id) => collections.deleteNotebook(id)
  });
  contextMenu.show(entries, e.clientX, e.clientY);
}

/** Commit the inline rename (Enter / blur). */
function onRenameCommit(): void {
  void collections.commitRename();
}

/** Cancel the inline rename (Esc). */
function onRenameCancel(): void {
  collections.cancelRename();
}

/** Bound to the rename `<input>` — updates the in-progress text. */
function onRenameInput(e: Event): void {
  collections.setRenameText((e.target as HTMLInputElement).value);
}

// --- manual drag-reorder (root notebooks only) -----------------------------
/** Begin a sidebar drag of this root row (carries `{section:"notebooks", id}`).
 *  Sub-notebook rows aren't draggable (`canReorder` false). */
function onDragStart(e: DragEvent): void {
  if (!canReorder.value) return;
  writeSidebarPayload(e, { section: "notebooks", id: props.node.item.id });
}

/** Allow a sidebar-row drop on this root row (sets `dropEffect = "move"`) +
 *  show the insertion indicator at the cursor's half (top = before, bottom = after).
 *  A note drag is accepted on ANY notebook (incl. sub-notebooks) and shows the
 *  whole-row note-drop highlight instead of the reorder line. */
function onDragOver(e: DragEvent): void {
  if (isNoteDrag(e)) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    noteDropOver.value = true;
    return;
  }
  if (!canReorder.value || !isSidebarDrag(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  dropTarget.value = { position: e.clientY - rect.top < rect.height / 2 ? "before" : "after" };
}

/** Clear this row's indicators when the pointer leaves it (guarded so a late
 *  `dragleave` from the previous row doesn't clear the newly-hovered row). */
function onDragLeave(e: DragEvent): void {
  noteDropOver.value = false;
  if (dropTarget.value) dropTarget.value = null;
}

/** Drop another root notebook onto this row: insert the dragged id before/after
 *  this row (top half = before, bottom half = after) via the collections store
 *  (local-only `localStorage` order). A note drop moves every dragged note into
 *  this notebook (works on sub-notebooks too). Ignored for cross-section /
 *  same-row notebook drops. */
function onDrop(e: DragEvent): void {
  if (isNoteDrag(e)) {
    const payload = readNotePayload(e);
    noteDropOver.value = false;
    if (!payload) return;
    e.preventDefault();
    markNoteDropHandled();
    void properties
      .addToNotebookMany(props.node.item.id, payload.ids)
      .then(() => void collections.load());
    return;
  }
  if (!canReorder.value) return;
  const payload = readSidebarPayload(e);
  if (!payload || payload.section !== "notebooks" || payload.id === props.node.item.id) {
    dropTarget.value = null;
    return;
  }
  e.preventDefault();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const before = e.clientY - rect.top < rect.height / 2;
  dropTarget.value = null;
  collections.moveNotebookTo(payload.id, props.node.item.id, before);
}
</script>

<template>
  <div>
    <button
      class="titlebar-no-drag group relative flex w-full items-center gap-1 rounded py-1 pr-2 text-left text-[12px] transition-colors"
      :class="[
        isSelected() ? 'bg-glass-active text-text' : 'text-text hover:bg-glass-hover',
        noteDropOver ? 'ring-2 ring-blue-400 bg-blue-400/10' : ''
      ]"
      :style="{ paddingLeft: props.depth * 12 + 8 + 'px' }"
      :title="node.item.description || node.item.title"
      :draggable="canReorder"
      @click="select"
      @contextmenu.prevent="onContext"
      @dragstart="onDragStart"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <!-- Drop indicator: a 2px accent line at the top (before) / bottom (after)
           showing where the dragged root notebook would insert. -->
      <span
        v-if="canReorder && dropTarget"
        class="pointer-events-none absolute inset-x-0 h-0.5 bg-blue-400"
        :class="dropTarget.position === 'before' ? '-top-px' : '-bottom-px'"
      />
      <!-- Expand/collapse chevron (only if it has children), else a spacer. -->
      <Icon
        v-if="node.children.length > 0"
        name="chevron-right"
        :size="10"
        class="shrink-0 transition-transform"
        :class="collections.expanded.has(node.item.id) ? 'rotate-90' : ''"
        @click.stop="collections.toggleExpand(node.item.id)"
      />
      <span v-else class="w-[10px] shrink-0" />

      <Icon
        :name="notebookIcons.icons[node.item.id] ?? 'book'"
        :size="12"
        class="shrink-0 text-text-muted"
      />
      <!-- Inline rename: swap the label for an <input> while renaming this row. -->
      <input
        v-if="isRenaming"
        ref="renameInput"
        :value="collections.renaming?.text ?? node.item.title"
        class="titlebar-no-drag min-w-0 flex-1 rounded-sm border border-glass-active bg-glass-surface px-1 py-0 text-[12px] text-text focus:outline-none"
        @input="onRenameInput"
        @click.stop
        @keydown.enter.prevent="onRenameCommit"
        @keydown.esc.prevent="onRenameCancel"
        @blur="onRenameCommit"
      />
      <template v-else>
        <span class="truncate">{{ node.item.title }}</span>
        <Icon
          v-if="node.item.pinned"
          name="pin"
          :size="10"
          class="shrink-0 text-amber-300/80"
          fill="currentColor"
          title="Pinned"
        />

        <!-- Shortcut star + create-sub-notebook. Each icon owns its opacity
             (the wrapper has no `opacity-0`), so a pinned notebook's ★ stays
             visible — CSS opacity compounds, so a child `opacity-100` inside a
             parent `opacity-0` is still hidden. Unified with the tag/color rows,
             where the indicator is a direct child of the row. -->
        <span class="ml-auto flex shrink-0 items-center gap-1 text-[10px]">
          <Icon
            name="plus"
            :size="10"
            class="text-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-text"
            :title="t('sidebar.createSubNotebook')"
            @click.stop="createSubNotebook"
          />
          <Icon
            name="star"
            :size="10"
            class="transition-opacity"
            :class="shortcuts.isShortcut(node.item.id) ? 'text-amber-300/80 opacity-100 thin-outline' : 'text-text-muted opacity-0 group-hover:opacity-100'"
            :fill="shortcuts.isShortcut(node.item.id) ? 'currentColor' : 'none'"
            :title="shortcuts.isShortcut(node.item.id) ? t('sidebar.removeFromShortcuts') : t('sidebar.addToShortcuts')"
            @click.stop="toggleShortcut"
          />
        </span>
      </template>
    </button>

    <!-- Recurse into children when expanded. -->
    <template v-if="collections.expanded.has(node.item.id)">
      <NotebookNode
        v-for="child in node.children"
        :key="child.item.id"
        :node="child"
        :depth="depth + 1"
      />
    </template>
  </div>
</template>