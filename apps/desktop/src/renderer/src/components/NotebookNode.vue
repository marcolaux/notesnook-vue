<script setup lang="ts">
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useCollectionsStore } from "@/stores/collections";
import { useNotesStore } from "@/stores/notes";
import { useShortcutsStore } from "@/stores/shortcuts";
import type { NotebookTreeNode } from "@/utils/collections";

defineOptions({ name: "NotebookNode" });

const props = defineProps<{
  node: NotebookTreeNode;
  depth: number;
}>();

const collections = useCollectionsStore();
const notes = useNotesStore();
const shortcuts = useShortcutsStore();
const router = useRouter();
const { t } = useI18n();

/** Is this notebook the currently-selected collection? */
function isSelected(): boolean {
  return collections.selected?.type === "notebook" && collections.selected.id === props.node.item.id;
}

/** Select the notebook, restrict the notes list to it (descendants included
 *  via `db.notebooks.notes`), and show the notes view. */
async function select(): Promise<void> {
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
</script>

<template>
  <div>
    <button
      class="titlebar-no-drag group flex w-full items-center gap-1 rounded py-1 pr-2 text-left text-[12px] transition-colors"
      :class="isSelected() ? 'bg-glass-active text-text' : 'text-text hover:bg-glass-hover'"
      :style="{ paddingLeft: props.depth * 12 + 8 + 'px' }"
      :title="node.item.description || node.item.title"
      @click="select"
    >
      <!-- Expand/collapse chevron (only if it has children), else a spacer. -->
      <svg
        v-if="node.children.length > 0"
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="shrink-0 transition-transform"
        :class="collections.expanded.has(node.item.id) ? 'rotate-90' : ''"
        @click.stop="collections.toggleExpand(node.item.id)"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
      <span v-else class="w-[10px] shrink-0" />

      <span class="shrink-0 text-text-muted">📓</span>
      <span class="truncate">{{ node.item.title }}</span>
      <span v-if="node.item.pinned" class="shrink-0 text-[10px] text-amber-300/80" title="Pinned">📌</span>

      <!-- Hover-revealed actions: create sub-notebook + toggle shortcut. -->
      <span
        class="ml-auto flex shrink-0 items-center gap-1 text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
      >
        <span
          class="text-text-muted hover:text-text"
          :title="t('sidebar.createSubNotebook')"
          @click.stop="createSubNotebook"
        >＋</span>
        <span
          :class="shortcuts.isShortcut(node.item.id) ? 'text-amber-300/80' : 'text-text-muted'"
          :title="shortcuts.isShortcut(node.item.id) ? t('sidebar.removeFromShortcuts') : t('sidebar.addToShortcuts')"
          @click.stop="toggleShortcut"
        >{{ shortcuts.isShortcut(node.item.id) ? "★" : "☆" }}</span>
      </span>
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