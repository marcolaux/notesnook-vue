<script setup lang="ts">
/**
 * Editor toolbar (Phase 5.5) — the formatting + utility strip below the editor
 * tab bar. Renders the 2D `ToolbarDefinition` from the {@link useToolbarStore}
 * (the persisted, per-account layout; default `DEFAULT_TOOLBAR`): each group
 * is a `ToolbarGroup` (rendered with a separator), and a nested array inside a
 * group is the "more" split-button (`MoreToolsButton`) whose popup holds the
 * group's extra actions.
 *
 * Per-action active/disabled/hidden state lives on the `EditorAction` itself
 * (editor-vue's `tool-definitions.ts`) — this component owns only the editor
 * transaction listener that bumps `editorVersion` so those states re-evaluate
 * on every transaction/update. The dropdown / colour / conditional menus are
 * built fresh on each open against the live selection (see `toolbar-menu.ts`).
 *
 * Trailing utility buttons (not editor actions): find-in-note
 * (`editorStore.requestFind` → opens the focused pane's `FindBar`, same as ⌘F),
 * ToC + properties panel toggles (`useShellStore`), and ⋯ → command palette.
 * Theme tokens (`bg-glass-*`/`text-text*`/`border-glass-border`) follow the app
 * theme.
 */
import { ref, watch, onBeforeUnmount } from "vue";
import type { Editor } from "@tiptap/vue-3";
import { Icon } from "@notesnook-vue/ui-vue";
import { useShellStore } from "@/stores/shell";
import { useNotesStore } from "@/stores/notes";
import { useCommandPaletteStore } from "@/stores/command-palette";
import { useToolbarStore } from "@/stores/toolbar";
import { useEditorStore } from "@/stores/editor";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useReminderDialogStore } from "@/stores/reminder-dialog";
import { useRemindersStore } from "@/stores/reminders";
import ToolbarGroup from "./ToolbarGroup.vue";

const props = defineProps<{
  editor: Editor | undefined;
}>();

const shell = useShellStore();
const notes = useNotesStore();
const palette = useCommandPaletteStore();
const toolbar = useToolbarStore();
const editorStore = useEditorStore();
const layout = useEditorLayoutStore();
const reminderDialog = useReminderDialogStore();
const reminders = useRemindersStore();

/** "Remind me" for the active note: open the reminder dialog seeded with the
 *  note's title + `nn://note/<id>` description; on confirm, create the reminder
 *  + link it to the note. No-op when no note is active (e.g. the ephemeral
 *  draft with no id). */
function remindMe(): void {
  const n = notes.activeNote;
  if (!n) return;
  void reminderDialog.openCreateForNote(n.id, n.title).then((input) => {
    if (input) void reminders.add(input);
  });
}

/** Toggle the per-tab note-history sidebar on the focused pane's active note
 *  tab. No-op when no note is active (e.g. the ephemeral draft). */
function toggleHistory(): void {
  const id = layout.activeTab?.id;
  if (id) layout.toggleHistory(id);
}

// Bumped on every editor transaction/update so the `ToolbarGroup` `items`
// computed re-runs and active/disabled/hidden states stay fresh.
const editorVersion = ref(0);

function refresh(): void {
  editorVersion.value++;
}

// Re-attach the transaction/update listeners when the editor instance changes
// (create/destroy — the Editor is keyed by note id) and clean up the previous.
watch(
  () => props.editor,
  (e, prev) => {
    if (prev) {
      prev.off("transaction", refresh);
      prev.off("update", refresh);
    }
    if (e) {
      e.on("transaction", refresh);
      e.on("update", refresh);
      refresh();
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  const e = props.editor;
  if (e) {
    e.off("transaction", refresh);
    e.off("update", refresh);
  }
});
</script>

<template>
  <div
    class="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-glass-border px-2"
  >
    <template v-for="(group, i) in toolbar.toolbarConfig" :key="i">
      <span v-if="i > 0" class="mx-1 h-5 w-px shrink-0 bg-glass-border" />
      <ToolbarGroup :group="group" :editor="props.editor" :version="editorVersion" />
    </template>

    <span class="mx-1 h-5 w-px shrink-0 bg-glass-border" />
    <button
      type="button"
      class="grid h-6 w-6 shrink-0 place-items-center rounded text-sm text-text-muted hover:bg-glass-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
      title="Find in note (⌘F)"
      :disabled="!props.editor"
      @click="editorStore.requestFindToggle()"
    >
      <Icon name="search" :size="16" />
    </button>
    <button
      type="button"
      class="grid h-6 w-6 shrink-0 place-items-center rounded text-sm text-text-muted hover:bg-glass-hover hover:text-text"
      :class="{ 'bg-glass-active text-text': shell.tocVisible }"
      title="Table of contents"
      @click="shell.toggleToc()"
    >
      <Icon name="list" :size="16" />
    </button>
    <button
      type="button"
      class="grid h-6 w-6 shrink-0 place-items-center rounded text-sm text-text-muted hover:bg-glass-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
      :class="{ 'bg-glass-active text-text': !!layout.activeTab?.historyVisible }"
      title="Note history"
      :disabled="!notes.activeNote"
      @click="toggleHistory()"
    >
      <Icon name="history" :size="16" />
    </button>
    <button
      type="button"
      class="grid h-6 w-6 shrink-0 place-items-center rounded text-sm text-text-muted hover:bg-glass-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
      title="Remind me about this note"
      :disabled="!notes.activeNote"
      @click="remindMe()"
    >
      <Icon name="bell" :size="16" />
    </button>
    <button
      type="button"
      class="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded text-sm text-text-muted hover:bg-glass-hover hover:text-text"
      title="Command palette (⌘⇧P)"
      @click="palette.openPalette()"
    >
      <Icon name="ellipsis" :size="16" />
    </button>
  </div>
</template>