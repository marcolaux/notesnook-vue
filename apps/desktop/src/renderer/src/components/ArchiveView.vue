<script setup lang="ts">
/**
 * Archive view — the archived-notes list with unarchive / move-to-trash
 * actions, backed by the headless `useArchiveStore` (which wraps
 * `db.notes.archived`). Rendered directly by `<RouterView />` in ShellLayout —
 * the root assumes a `min-h-0 flex-1 min-w-0` flex context. Mirrors
 * `TrashView.vue`.
 *
 * Labels are English literals (the codebase is mid-i18n — TrashView /
 * NotesList hardcode the same way; migrating these is the Phase 7.1 sweep).
 * The sidebar archive *badge* lives in the collections store; after any
 * mutation here we call `collections.reloadArchiveCount()` so it stays in
 * sync, and `notes.load()` after an unarchive so the note reappears in All
 * Notes. Moving an archived note to trash also refreshes the trash badge.
 *
 * Archived notes stay openable — clicking a row opens it in the editor
 * (`db.notes.note(id)` is a direct lookup, not archive-filtered). Move-to-trash
 * uses the headless `useDialogStore.confirm` overlay for confirmation.
 */
import { onMounted } from "vue";
import { useArchiveStore, type ArchiveListItem } from "@/stores/archive";
import { useNotesStore } from "@/stores/notes";
import { useCollectionsStore } from "@/stores/collections";
import { useDialogStore } from "@/stores/dialog";
import { useContextMenuStore } from "@/stores/context-menu";
import { separator, type MenuItem } from "@/utils/context-menu";

const archive = useArchiveStore();
const notes = useNotesStore();
const collections = useCollectionsStore();
const dialog = useDialogStore();
const contextMenu = useContextMenuStore();

onMounted(() => {
  void archive.load();
});

/** Same-day → HH:MM, otherwise a short `Mon D, YYYY` date. Inlined here to
 *  match NotesList / TrashView (it isn't exported from a shared util yet). */
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

/** Unarchive a note, then reload the notes list (so it reappears in All
 *  Notes) + the sidebar archive badge. */
async function unarchiveItem(item: ArchiveListItem): Promise<void> {
  await archive.unarchive([item.id]);
  void notes.load();
  void collections.reloadArchiveCount();
}

/** Move an archived note to trash (confirm-gated), then refresh both badges. */
async function moveToTrashItem(item: ArchiveListItem): Promise<void> {
  const ok = await dialog.confirm({
    title: "Move to trash",
    message: `Move “${item.title}” to trash? You can restore it from the trash later.`,
    confirmLabel: "Move to trash",
    danger: true
  });
  if (!ok) return;
  await archive.moveToTrash([item.id]);
  void notes.load();
  void collections.reloadArchiveCount();
  void collections.reloadTrashCount();
}

/** Right-click an archive row → a small Unarchive / Move-to-trash menu. */
function onRowContext(item: ArchiveListItem, e: MouseEvent): void {
  const items: MenuItem[] = [
    { id: "unarchive", label: "Unarchive", onSelect: () => void unarchiveItem(item) },
    separator("sep"),
    {
      id: "delete",
      label: "Move to trash",
      danger: true,
      onSelect: () => void moveToTrashItem(item)
    }
  ];
  contextMenu.show(items, e.clientX, e.clientY);
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col backdrop-blur-xl">
    <!-- Header: title + count -->
    <div class="flex h-9 shrink-0 items-center gap-2 border-b border-glass-border px-3">
      <span class="text-xs font-semibold text-text">Archive</span>
      <span class="text-[10px] text-text-muted">{{ archive.count }} note(s)</span>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-1">
      <div v-if="archive.loading && archive.items.length === 0" class="px-2 py-4 text-center text-[10px] text-text-muted">
        Loading…
      </div>
      <button
        v-for="item in archive.items"
        :key="item.id"
        class="group block w-full rounded-md px-2 py-1.5 text-left hover:bg-glass-hover"
        @contextmenu.prevent="onRowContext(item, $event)"
      >
        <div class="flex items-center gap-1">
          <span class="truncate text-xs font-medium text-text">{{ item.title }}</span>
          <span class="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              class="titlebar-no-drag rounded-sm px-1 py-0.5 text-[9px] text-text-muted hover:bg-glass-active hover:text-text"
              title="Unarchive"
              @click.stop="unarchiveItem(item)"
            >
              Unarchive
            </button>
            <button
              class="titlebar-no-drag rounded-sm px-1 py-0.5 text-[9px] text-rose-300/80 hover:bg-glass-active"
              title="Move to trash"
              @click.stop="moveToTrashItem(item)"
            >
              Delete
            </button>
          </span>
        </div>
        <div class="mt-0.5 flex items-center gap-1.5 text-[9px] text-text-muted">
          <span v-if="item.headline" class="truncate">{{ item.headline }}</span>
          <span v-else>No additional text</span>
          <span class="ml-auto shrink-0">{{ formatDate(item.dateEdited) }}</span>
        </div>
      </button>
      <div v-if="!archive.loading && archive.items.length === 0" class="px-2 py-4 text-center text-[10px] text-text-muted">
        Archive is empty
      </div>
    </div>
  </div>
</template>