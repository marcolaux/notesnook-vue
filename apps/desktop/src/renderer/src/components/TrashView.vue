<script setup lang="ts">
/**
 * Trash view (Phase 3.3) — the trashed-notes list with restore / delete
 * permanently / empty-trash actions, backed by the headless `useTrashStore`
 * (which wraps `db.trash`). Rendered directly by `<RouterView />` in
 * ShellLayout — the root assumes a `min-h-0 flex-1 min-w-0` flex context.
 *
 * Labels resolve via vue-i18n (`trash.*` / `common.*`). The sidebar trash
 * *badge* lives in the collections store; after any mutation here we call
 * `collections.reloadTrashCount()` so it stays in sync, and `notes.load()`
 * after a restore so the note reappears in All Notes.
 *
 * Restoring / permanently deleting uses the headless `useDialogStore.confirm`
 * overlay (mounted once in App.vue) for destructive confirmation.
 */
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useTrashStore, type TrashListItem } from "@/stores/trash";
import { useNotesStore } from "@/stores/notes";
import { useCollectionsStore } from "@/stores/collections";
import { useDialogStore } from "@/stores/dialog";
import { useContextMenuStore } from "@/stores/context-menu";
import { separator, type MenuItem } from "@/utils/context-menu";

const trash = useTrashStore();
const notes = useNotesStore();
const collections = useCollectionsStore();
const dialog = useDialogStore();
const contextMenu = useContextMenuStore();
const { t } = useI18n();

onMounted(() => {
  void trash.load();
});

/** Same-day → HH:MM, otherwise a short `Mon D, YYYY` date. Inlined here to
 *  match NotesList (it isn't exported from a shared util yet). */
function formatDate(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric"
  });
}

/** Restore a trashed note, then reload the notes list (so it reappears in All
 *  Notes) + the sidebar trash badge. */
async function restoreItem(item: TrashListItem): Promise<void> {
  await trash.restore([item.id]);
  void notes.load();
  void collections.reloadTrashCount();
}

/** Permanently delete a trashed note (confirm-gated), then refresh the badge. */
async function deleteItemPermanently(item: TrashListItem): Promise<void> {
  const ok = await dialog.confirm({
    title: t("trash.deletePermanently"),
    message: t("trash.deleteConfirm", { title: item.title }),
    confirmLabel: t("common.delete"),
    cancelLabel: t("common.cancel"),
    danger: true
  });
  if (!ok) return;
  await trash.remove([item.id]);
  void collections.reloadTrashCount();
}

/** Empty the entire trash (confirm-gated), then refresh the badge. */
async function emptyTrash(): Promise<void> {
  const ok = await dialog.confirm({
    title: t("trash.emptyTrash"),
    message: t("trash.emptyTrashConfirm", { n: trash.count }),
    confirmLabel: t("trash.emptyTrash"),
    cancelLabel: t("common.cancel"),
    danger: true
  });
  if (!ok) return;
  await trash.clear();
  void collections.reloadTrashCount();
}

/** Right-click a trash row → a small Restore / Delete-permanently menu. */
function onRowContext(item: TrashListItem, e: MouseEvent): void {
  const items: MenuItem[] = [
    { id: "restore", label: t("common.restore"), onSelect: () => void restoreItem(item) },
    separator("sep"),
    {
      id: "delete-perm",
      label: t("trash.deletePermanently"),
      danger: true,
      onSelect: () => void deleteItemPermanently(item)
    }
  ];
  contextMenu.show(items, e.clientX, e.clientY);
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col backdrop-blur-xl">
    <!-- Header: title + Empty trash -->
    <div class="flex h-9 shrink-0 items-center gap-2 border-b border-glass-border px-3">
      <span class="text-xs font-semibold text-text">{{ t("trash.title") }}</span>
      <span class="text-[10px] text-text-muted">{{ t("trash.count", { n: trash.noteItems.length }) }}</span>
      <button
        class="titlebar-no-drag ml-auto rounded-sm px-2 py-0.5 text-[10px] text-text-muted transition-colors hover:bg-glass-hover disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="trash.count === 0"
        :title="t('trash.emptyTrash')"
        @click="emptyTrash()"
      >
        {{ t("trash.emptyTrash") }}
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-1">
      <div v-if="trash.loading && trash.noteItems.length === 0" class="px-2 py-4 text-center text-[10px] text-text-muted">
        {{ t("trash.loading") }}
      </div>
      <button
        v-for="item in trash.noteItems"
        :key="item.id"
        class="group block w-full rounded-md px-2 py-1.5 text-left hover:bg-glass-hover"
        @contextmenu.prevent="onRowContext(item, $event)"
      >
        <div class="flex items-center gap-1">
          <span class="truncate text-xs font-medium text-text">{{ item.title }}</span>
          <span class="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              class="titlebar-no-drag rounded-sm px-1 py-0.5 text-[9px] text-text-muted hover:bg-glass-active hover:text-text"
              :title="t('common.restore')"
              @click.stop="restoreItem(item)"
            >
              {{ t("common.restore") }}
            </button>
            <button
              class="titlebar-no-drag rounded-sm px-1 py-0.5 text-[9px] text-rose-300/80 hover:bg-glass-active"
              :title="t('trash.deletePermanently')"
              @click.stop="deleteItemPermanently(item)"
            >
              {{ t("common.delete") }}
            </button>
          </span>
        </div>
        <div class="mt-0.5 flex items-center gap-1.5 text-[9px] text-text-muted">
          <span class="shrink-0 rounded-sm bg-glass-hover px-1">{{ item.type }}</span>
          <span v-if="item.headline" class="truncate">{{ item.headline }}</span>
          <span v-else>{{ t("common.noAdditionalText") }}</span>
          <span class="ml-auto shrink-0">{{ formatDate(item.dateDeleted) }}</span>
        </div>
      </button>
      <div v-if="!trash.loading && trash.noteItems.length === 0" class="px-2 py-4 text-center text-[10px] text-text-muted">
        {{ t("trash.empty") }}
      </div>
    </div>
  </div>
</template>