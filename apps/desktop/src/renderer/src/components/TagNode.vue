<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Icon } from "@notesnook-vue/ui-vue";
import { useCollectionsStore } from "@/stores/collections";
import { usePropertiesStore } from "@/stores/properties";
import { useShortcutsStore } from "@/stores/shortcuts";
import { useContextMenuStore } from "@/stores/context-menu";
import { useDialogStore } from "@/stores/dialog";
import { buildTagMenu } from "@/utils/context-menu-entries";
import { goToCollection } from "@/utils/collection-nav";
import { isNoteDrag, readNotePayload, markNoteDropHandled } from "@/utils/note-dnd";
import type { TagTreeNode } from "@/utils/collections";

defineOptions({ name: "TagNode" });

const props = defineProps<{
  node: TagTreeNode;
  depth: number;
}>();

const collections = useCollectionsStore();
const properties = usePropertiesStore();
const shortcuts = useShortcutsStore();
const contextMenu = useContextMenuStore();
const dialog = useDialogStore();
const { t } = useI18n();

const renameInput = ref<HTMLInputElement | null>(null);

/** Whole-row highlight when a note drag hovers this row (an assignment).
 *  Per-instance so only the hovered row shows a marker; cleared on
 *  `dragleave`/`drop`. Mirrors `NotebookNode.vue`. */
const noteDropOver = ref(false);

/** Selection key: the real tag's id when one exists at this path, else the
 *  slash-path itself (grouping-only nodes have no tag id). `filterByCollection`
 *  disambiguates the same way. */
const key = computed(() => props.node.tag?.id ?? props.node.path);

/** Does this node carry a real tag (renameable/deletable/pinnable, accepts
 *  note drops)? Grouping-only prefixes (`tag === null`) are just selectable +
 *  expandable. */
const hasTag = computed(() => props.node.tag !== null);

/** Is this tag node the currently-selected collection? */
function isSelected(): boolean {
  return collections.selected?.type === "tag" && collections.selected.id === key.value;
}

/** Is this row the target of the currently-open context menu? */
function isContextTarget(): boolean {
  return hasTag.value && contextMenu.contextId === props.node.tag?.id;
}

/** Is this row in inline-rename mode? (Only real tags rename.) */
const isRenaming = computed(
  () => hasTag.value && collections.renaming?.kind === "tag" && collections.renaming.id === props.node.tag?.id
);

/** Focus + select the rename input whenever this row enters rename mode —
 *  covers both the context-menu rename of an existing row (isRenaming flips
 *  true) and a freshly created row that mounts already in rename mode
 *  (`createTag`/`createSubTag` call `startRename` before the row mounts).
 *  Selecting the placeholder lets the user type over it immediately. */
watch(
  isRenaming,
  (renaming) => {
    if (renaming)
      void nextTick().then(() => {
        renameInput.value?.focus();
        renameInput.value?.select();
      });
  },
  { immediate: true }
);

/** Select the tag (filtering to this node's exact tag + all descendants —
 *  resolved in `notes.filterByCollection`), then show the notes view. */
async function select(): Promise<void> {
  if (isRenaming.value) return; // don't navigate while renaming
  await goToCollection("tag", key.value);
}

/** Pin/unpin this tag as a sidebar shortcut (db.shortcuts). Real tags only. */
function toggleShortcut(): void {
  if (!props.node.tag) return;
  void shortcuts.toggle(props.node.tag.id, "tag");
}

/** Create a sub-tag under this node: a new tag titled `<node.path>/New tag`
 *  (the hierarchy is the `/` in the title — no parent→child relation). Works
 *  on grouping-only nodes too (a prefix can gain its first child). Expands
 *  the parent so the new child is visible. Mirrors NotebookNode's `+`. */
function createSubTag(): void {
  void collections.createSubTag(props.node.path);
}

/** Right-click a real tag → tag context menu at the cursor. Grouping-only
 *  nodes get no menu (nothing to rename/delete/pin). */
function onContext(e: MouseEvent): void {
  if (!props.node.tag || isRenaming.value) return;
  const target = { id: props.node.tag.id, title: props.node.tag.title };
  const entries = buildTagMenu(target, {
    toggleShortcut: (id) => void shortcuts.toggle(id, "tag"),
    isShortcut: (id) => shortcuts.isShortcut(id),
    // Seed the rename input with the LEAF (the segment the user edits); the
    // parent prefix is preserved on commit by `renameTag`. `buildTagMenu`
    // passes the full `tag.title` — ignore it, use `node.label`.
    rename: (id) => collections.startRename("tag", id, props.node.label),
    confirm: (opts) => dialog.confirm(opts),
    deleteTag: (id) => collections.deleteTag(id)
  });
  contextMenu.show(entries, e.clientX, e.clientY, props.node.tag.id);
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

/** Allow a note drop on a real-tag row + show the whole-row highlight.
 *  Grouping-only nodes accept no drop (no tag id to assign). */
function onDragOver(e: DragEvent): void {
  if (!hasTag.value || !isNoteDrag(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  noteDropOver.value = true;
}

function onDragLeave(): void {
  noteDropOver.value = false;
}

/** Drop notes on a real tag row → assign the tag to every dragged note
 *  (idempotent on a tag a note already has), then reload the sidebar counts. */
function onDrop(e: DragEvent): void {
  if (!hasTag.value || !isNoteDrag(e)) return;
  const payload = readNotePayload(e);
  noteDropOver.value = false;
  if (!payload || !props.node.tag) return;
  e.preventDefault();
  markNoteDropHandled();
  void properties
    .addTagToMany(props.node.tag.id, payload.ids)
    .then(() => void collections.load());
}
</script>

<template>
  <div>
    <button
      class="titlebar-no-drag group relative flex w-full items-center gap-1 rounded py-1 pr-2 text-left text-[12px] transition-colors"
      :class="[
        isSelected() ? 'bg-glass-active text-text' : 'text-text hover:bg-glass-hover',
        noteDropOver ? 'ring-2 ring-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : '',
        isContextTarget() ? 'context-target-row' : ''
      ]"
      :style="{ paddingLeft: props.depth * 12 + 8 + 'px' }"
      :title="node.path"
      @click="select"
      @contextmenu.prevent="onContext"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <!-- Expand/collapse chevron (only if it has children), else a spacer. -->
      <Icon
        v-if="node.children.length > 0"
        name="chevron-right"
        :size="10"
        class="shrink-0 transition-transform"
        :class="collections.expandedTags.has(node.path) ? 'rotate-90' : ''"
        @click.stop="collections.toggleTagExpand(node.path)"
      />
      <span v-else class="w-[10px] shrink-0" />

      <span class="shrink-0 text-text-muted">#</span>

      <!-- Inline rename: swap the label for an <input> while renaming this row. -->
      <input
        v-if="isRenaming"
        ref="renameInput"
        :value="collections.renaming?.text ?? node.label"
        class="titlebar-no-drag min-w-0 flex-1 rounded-sm border border-glass-active bg-glass-surface px-1 py-0 text-[12px] text-text focus:outline-none"
        @input="onRenameInput"
        @click.stop
        @keydown.enter.prevent="onRenameCommit"
        @keydown.esc.prevent="onRenameCancel"
        @blur="onRenameCommit"
      />
      <template v-else>
        <span class="truncate">{{ node.label }}</span>
        <!-- Create-sub-tag `+` (on every node — any tag can gain a child) + the
             shortcut star (real tags only). Each icon owns its opacity (a child
             `opacity-100` inside a parent `opacity-0` is still hidden), so a
             pinned tag's ★ stays visible. Mirrors NotebookNode's row actions. -->
        <span class="ml-auto flex shrink-0 items-center gap-1 text-[10px]">
          <Icon
            name="plus"
            :size="10"
            class="text-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-text"
            :title="t('sidebar.createSubTag')"
            @click.stop="createSubTag"
          />
          <Icon
            v-if="hasTag"
            name="star"
            :size="10"
            class="transition-opacity"
            :class="shortcuts.isShortcut(node.tag!.id) ? 'text-amber-500 opacity-100 thin-outline' : 'text-text-muted opacity-0 group-hover:opacity-100'"
            :fill="shortcuts.isShortcut(node.tag!.id) ? 'currentColor' : 'none'"
            :title="shortcuts.isShortcut(node.tag!.id) ? t('sidebar.removeFromShortcuts') : t('sidebar.addToShortcuts')"
            @click.stop="toggleShortcut"
          />
        </span>
      </template>
    </button>

    <!-- Recurse into children when expanded. -->
    <template v-if="collections.expandedTags.has(node.path)">
      <TagNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
      />
    </template>
  </div>
</template>