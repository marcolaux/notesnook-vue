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
 * ToC + properties panel toggles (`useShellStore`), and a context-sensitive
 * Publish button: a "Publish" text button (opens the publish dialog) when the
 * active note is unpublished, or the globe icon, title "Published", opening a
 * note-actions context menu (Unpublish / Copy monograph URL / Open in browser)
 * when it is published — built via `useContextMenuStore` (NOT the editor-vue
 * `EditorAction` path, which is formatting-only).
 * Theme tokens (`bg-glass-*`/`text-text*`/`border-glass-border`) follow the app
 * theme.
 */
import { ref, watch, onBeforeUnmount } from "vue";
import type { Editor } from "@tiptap/vue-3";
import { Icon } from "@notesnook-vue/ui-vue";
import { useShellStore } from "@/stores/shell";
import { useNotesStore } from "@/stores/notes";
import { useStatusStore } from "@/stores/status";
import { useToolbarStore } from "@/stores/toolbar";
import { useEditorStore } from "@/stores/editor";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useReminderDialogStore } from "@/stores/reminder-dialog";
import { useRemindersStore } from "@/stores/reminders";
import { usePublishStore } from "@/stores/publish";
import { usePublishDialogStore } from "@/stores/publish-dialog";
import { useDialogStore } from "@/stores/dialog";
import { useContextMenuStore } from "@/stores/context-menu";
import { type MenuItem } from "@/utils/context-menu";
import ToolbarGroup from "./ToolbarGroup.vue";

const props = defineProps<{
  editor: Editor | undefined;
}>();

const shell = useShellStore();
const notes = useNotesStore();
const status = useStatusStore();
const toolbar = useToolbarStore();
const editorStore = useEditorStore();
const layout = useEditorLayoutStore();
const reminderDialog = useReminderDialogStore();
const reminders = useRemindersStore();
const publish = usePublishStore();
const publishDialog = usePublishDialogStore();
const dialog = useDialogStore();
const contextMenu = useContextMenuStore();

/** The publish button — template ref for positioning its submenu. */
const publishBtn = ref<HTMLButtonElement | null>(null);

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

/** Open the publish dialog for the active note (the "Publish" button click
 *  when the note is not yet published). On confirm, publish via the publish
 *  store's explicit-id action. No-op when no note is active. */
function openPublishDialog(): void {
  const n = notes.activeNote;
  if (!n) return;
  void publishDialog.openCreate(n.id, n.title).then((input) => {
    if (!input) return;
    const { title, ...opts } = input;
    void publish.publishById(n.id, title, opts);
  });
}

/** Open the "Published" submenu — unpublish / copy URL / open in browser for
 *  the active note. Only called when the note is already published (the
 *  published button opens this; the publish dialog path is separate). Uses the
 *  context-menu store (the same surface as right-click) rather than the
 *  editor-vue `EditorAction` path, which is formatting-only. */
function openPublishedMenu(): void {
  const n = notes.activeNote;
  if (!n || !publishBtn.value) return;
  const items: MenuItem[] = [
    {
      id: "unpublish",
      label: "Unpublish note",
      icon: "trash-2",
      danger: true,
      onSelect: async () => {
        const ok = await dialog.confirm({
          title: "Unpublish note",
          message: "This note will no longer be public. The link will stop working.",
          confirmLabel: "Unpublish",
          danger: true
        });
        if (ok) void publish.unpublishById(n.id);
      }
    },
    {
      id: "copy-url",
      label: "Copy monograph URL",
      icon: "link",
      onSelect: () => {
        if (publish.publishUrl) void navigator.clipboard.writeText(publish.publishUrl);
      }
    },
    {
      id: "open",
      label: "Open in browser",
      icon: "external-link",
      onSelect: () => {
        // `window.open` is intercepted by `setWindowOpenHandler` →
        // `shell.openExternal`, so this opens the system browser.
        if (publish.publishUrl) window.open(publish.publishUrl, "_blank", "noopener");
      }
    }
  ];
  const r = publishBtn.value.getBoundingClientRect();
  contextMenu.show(items, r.right, r.bottom + 4, n.id);
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
    <!-- Autosave indicator for the focused pane's editor, pushed in by
         Editor.vue via status.setSaveState. `ml-auto` anchors this (and the
         publish button after it) to the right edge; the empty-string idle
         state keeps the layout stable. -->
    <span class="ml-auto shrink-0 px-1 text-[10px] text-text-muted">
      {{ status.saving ? "Saving…" : status.savedAt ? "Saved" : "" }}
    </span>
    <!-- Publish button — a single affordance that reflects publish state:
         - Not published: a "Publish" text button → opens the publish dialog.
         - Published: the globe icon, title "Published" → opens the submenu
           (Unpublish / Copy monograph URL / Open in browser). -->
    <button
      v-if="!publish.published"
      ref="publishBtn"
      type="button"
      class="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-text-muted hover:bg-glass-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
      title="Publish note"
      :disabled="!notes.activeNote"
      @click="openPublishDialog()"
    >
      Publish
    </button>
    <button
      v-else
      ref="publishBtn"
      type="button"
      class="grid h-6 w-6 shrink-0 place-items-center rounded text-sm text-text-muted hover:bg-glass-hover hover:text-text"
      title="Published"
      @click="openPublishedMenu()"
    >
      <Icon name="globe" :size="16" />
    </button>
  </div>
</template>