<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { Icon } from "@notesnook-vue/ui-vue";
import { useNotesStore } from "@/stores/notes";
import { useAuthStore } from "@/stores/auth";
import { useStatusStore } from "@/stores/status";
import { syncStatusText } from "@/utils/status";
import { useCollectionsStore } from "@/stores/collections";
import { useShortcutsStore } from "@/stores/shortcuts";
import { useColorsStore } from "@/stores/colors";
import { useRemindersStore } from "@/stores/reminders";
import { usePropertiesStore } from "@/stores/properties";
import { useContextMenuStore } from "@/stores/context-menu";
import { useDialogStore } from "@/stores/dialog";
import { topViews, bottomViews } from "@/router/routes";
import { desktop } from "@/platform/desktop-bridge";
import NotebookNode from "@/components/NotebookNode.vue";
import TagNode from "@/components/TagNode.vue";
import {
  buildShortcutMenu,
  buildColorRowMenu,
  buildSidebarSectionMenu,
  type ShortcutMenuTarget
} from "@/utils/context-menu-entries";
import {
  isSidebarDrag,
  readSidebarPayload,
  writeSidebarPayload,
  applyManualOrder,
  moveIdTo
} from "@/utils/sidebar-order";
import { isNoteDrag, readNotePayload, markNoteDropHandled } from "@/utils/note-dnd";
import { goToCollection } from "@/utils/collection-nav";
import type { CollectionType } from "@/stores/collections";

const notes = useNotesStore();
const auth = useAuthStore();
const status = useStatusStore();
const collections = useCollectionsStore();
const shortcuts = useShortcutsStore();
const colors = useColorsStore();
const reminders = useRemindersStore();
const properties = usePropertiesStore();
const contextMenu = useContextMenuStore();
const dialog = useDialogStore();

// The color collection is loaded in `App.vue` alongside `collections.load()`
// (after `bootstrap()`) — NOT here: the Sidebar mounts before the db is ready,
// so a `colors.refresh()` in `onMounted` would race the db and silently no-op,
// leaving the Colors section empty after reload. `colors.add`/`remove` refresh
// the store internally; `App.vue`'s post-bootstrap call seeds the initial list.
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

// Sync status for the account area: "Local only" when logged out, else the
// sync lifecycle from `useStatusStore` formatted via `syncStatusText`. Reads
// `status.now` (a reactive wall-clock bumped by the status store's interval)
// so the relative time stays accurate without a nudge.
const syncText = computed(() =>
  syncStatusText(auth.isLoggedIn, status.syncState, status.lastSynced, status.hasUnsyncedChanges, status.now)
);

/** Function ref for a row's inline-rename `<input>` (used by the color row
 *  here — the tag rows own their rename inside `TagNode.vue`): focus + select
 *  it as soon as it mounts (avoids the v-for array-ref trap — only the
 *  renaming row renders an input). Selecting the placeholder lets the user
 *  type over it immediately, including a freshly created color. Typed `any`
 *  because Vue's VNodeRef passes either an Element or a component instance;
 *  we narrow at runtime. */
function focusTagRename(el: unknown): void {
  const node = el as HTMLInputElement | null;
  if (node && typeof node.focus === "function") {
    node.focus();
    node.select();
  }
}

/** Local collapse for the Shortcuts section (the collections store only owns
 *  notebooks/tags collapse). Expanded by default. */
const shortcutsCollapsed = ref(false);
const colorsCollapsed = ref(false);

/** Drop indicators for the colors + shortcuts sections: which row the dragged
 *  item would insert before/after (a 2px blue line at the top/bottom of the
 *  row). Cleared on `dragleave`/`drop`. Mirrors `NoteTabs.vue`'s tab indicator. */
const colorDropTarget = ref<{ id: string; position: "before" | "after" } | null>(null);
const shortcutDropTarget = ref<{ id: string; position: "before" | "after" } | null>(null);

/** Note-drag drop indicator for the inline sidebar targets: tag rows, color
 *  rows, and the Archive / Trash links. A note drop is an assignment (not a
 *  positional insert), so this drives a whole-row ring highlight (not the
 *  reorder insertion line). Notebook rows manage their own per-instance
 *  indicator in `NotebookNode.vue`. Cleared on `dragleave`/`drop`. */
const noteDropOver = ref<
  | { kind: "tag" | "color" | "archive" | "trash"; id?: string }
  | null
>(null);

/** Plain-link top views (All Notes / Archive; Monographs only when logged in)
 * — Notebooks & Tags render as expandable collection sections below.
 * Monographs is the published-notes view, which needs a logged-in account
 * (publishing is a server call), so it is hidden in local-only mode. */
const linkTopViews = computed(() =>
  topViews.filter(
    (v) =>
      v.name !== "notebooks" &&
      v.name !== "tags" &&
      (v.name !== "monographs" || auth.isLoggedIn)
  )
);
// Settings opens its own window (singleton) via IPC, so it is NOT a router
// link here — render it as a button below the Trash link.
const linkBottomViews = bottomViews.filter((v) => v.name !== "settings");

/** Open the shared Settings window (focused singleton). Best-effort. */
function openSettings(): void {
  void desktop.window.openSettings.mutate().catch((e) => {
    // eslint-disable-next-line no-console
    console.error("[sidebar] openSettings failed:", e);
  });
}

/** Active-state is driven by the exact current path (no nested routes here). */
function isActive(path: string): boolean {
  return route.path === path;
}

/** Is a given collection item the currently-selected one? */
function isSelected(type: CollectionType, id: string): boolean {
  return collections.selected?.type === type && collections.selected.id === id;
}

/** Is this row the target of the currently-open context menu? The context-menu
 *  store tags the target via `contextId` on `show`; `close` + every `show`
 *  rewrites it, so it never lingers after the menu closes or switches source.
 *  Used to keep a dashed outline on the row the (floating) menu acts on. */
function isContextTarget(id: string): boolean {
  return contextMenu.contextId === id;
}

/** "All Notes" drops any active collection filter + selection, and leaves the
 *  Tasks view (its filter is mutually exclusive with the full list). */
function showAllNotes(): void {
  notes.clearCollectionFilter();
  notes.setTasksFilterActive(false);
  collections.clearSelection();
}

/** Select a collection, restrict the notes list to it, and show the notes
 * view. Delegates to the shared `goToCollection` so the sidebar, the editor
 * footer tag chips, and the inline `#tag` chip click all share one flow. */
async function selectCollection(type: CollectionType, id: string): Promise<void> {
  await goToCollection(type, id);
}

/** Pin/unpin a notebook or tag as a sidebar shortcut (`db.shortcuts`). The
 *  `type` matches the shortcut's `itemType`; colors are NOT `db.shortcuts`
 *  items (upstream allows notebook/topic/tag only), so a color's fav star
 *  toggles a local-only favorite via `colors.toggleFavoriteColor` instead —
 *  hence this is narrower than `CollectionType` (which also includes "color"). */
function toggleShortcut(type: "notebook" | "tag", id: string): void {
  void shortcuts.toggle(id, type);
}

/** The rows rendered in the Shortcuts section: pinned notebooks/tags
 *  (`db.shortcuts`, dateCreated order), favourite notes (`notes.favorites`,
 *  dateEdited-desc — derived from `note.favorite`, NOT `db.shortcuts` since
 *  upstream disallows notes), and favorited colors (`colors.favorites` —
 *  local-only favorites, since upstream disallows colors as shortcuts) — then
 *  the local-only manual order overlay (`shortcuts.order`). */
const shortcutRows = computed<ShortcutMenuTarget[]>(() =>
  applyManualOrder(
    [...shortcuts.resolved, ...notes.favorites, ...colors.favorites],
    shortcuts.order
  )
);

/** Open a shortcut row. Notebook/tag → filter the notes list to it (existing
 *  `selectCollection`). A favourite note → open the note in the editor: drop
 *  any active collection filter/selection, open the note tab, route to /all. */
function openShortcut(sc: ShortcutMenuTarget): void {
  if (sc.type === "note") {
    notes.clearCollectionFilter();
    collections.clearSelection();
    notes.selectNote(sc.id);
    void router.push("/all");
    return;
  }
  void selectCollection(sc.type, sc.id);
}

/** Remove a shortcut row. Notebook/tag → unpin via `db.shortcuts`. A favourite
 *  note → unfavourite via the properties store (toggles `note.favorite` +
 *  reloads the list, so the row drops out reactively). A favorited color →
 *  unfavorite via the colors store (local-only toggle; drops out reactively). */
function removeShortcut(sc: ShortcutMenuTarget): void {
  if (sc.type === "note") {
    void properties.toggle("favorite", sc.id);
    return;
  }
  if (sc.type === "color") {
    colors.toggleFavoriteColor(sc.id);
    return;
  }
  void shortcuts.remove(sc.id);
}

/** Active-state for a shortcut row: a notebook/tag matches the selected
 *  collection; a favourite note matches the active (open) note. */
function isShortcutActive(sc: ShortcutMenuTarget): boolean {
  return sc.type === "note"
    ? notes.activeNote?.id === sc.id
    : isSelected(sc.type, sc.id);
}

/** Row glyph: notebook → book, tag → hash, favourite note → file-text. Color
 *  rows render a swatch (not an icon) in the template, so the `"color"` branch
 *  is a harmless fallback never rendered. */
function shortcutGlyph(type: ShortcutMenuTarget["type"]): string {
  if (type === "notebook") return "book";
  if (type === "tag") return "hash";
  if (type === "color") return "circle";
  return "file-text";
}

/** Right-click a color row → color-row context menu (Rename… / Delete color)
 *  at the cursor. Rename enters inline-rename mode for the row (same UX as the
 *  tag row): the label swaps to an `<input>`; Enter/blur commits via
 *  `colors.renameColor` (upserts by id, preserving colorCode), Esc cancels. */
function onColorContext(
  color: { id: string; title: string; colorCode: string },
  e: MouseEvent
): void {
  const entries = buildColorRowMenu(color, {
    rename: (id, title) => collections.startRename("color", id, title),
    confirm: (opts) => dialog.confirm(opts),
    deleteColor: (id) => colors.remove([id]),
    toggleShortcut: (id) => colors.toggleFavoriteColor(id),
    isShortcut: (id) => colors.isFavoriteColor(id)
  });
  contextMenu.show(entries, e.clientX, e.clientY, color.id);
}

/** Right-click a shortcut row → shortcut context menu at the cursor. */
function onShortcutContext(sc: ShortcutMenuTarget, e: MouseEvent): void {
  const entries = buildShortcutMenu(sc, {
    open: (target) => openShortcut(target),
    removeShortcut: (id) => removeShortcut(sc)
  });
  contextMenu.show(entries, e.clientX, e.clientY, sc.id);
}

/** Is a color row currently in inline-rename mode? (The collections store owns
 *  the shared `renaming` UI state — `kind` discriminates notebook/tag/color.) */
function isColorRenaming(id: string): boolean {
  return collections.renaming?.kind === "color" && collections.renaming.id === id;
}

/** Bound to a color rename `<input>`. */
function onColorRenameInput(e: Event): void {
  collections.setRenameText((e.target as HTMLInputElement).value);
}
/** Commit a color rename: upsert the new title via the colors store (preserves
 *  the colorCode), then clear the editing state. No-op when nothing is being
 *  renamed. */
async function onColorRenameCommit(): Promise<void> {
  const r = collections.renaming;
  if (!r) return;
  const trimmed = r.text.trim();
  if (trimmed) await colors.renameColor(r.id, trimmed);
  collections.cancelRename();
}
function onColorRenameCancel(): void {
  collections.cancelRename();
}

// --- Colors manual drag-reorder (synced via db.settings.setSideBarOrder) ----
/** Begin a sidebar drag of a color row (carries `{section:"colors", id}`). */
function onColorDragStart(color: { id: string }, e: DragEvent): void {
  writeSidebarPayload(e, { section: "colors", id: color.id });
}
/** Allow a sidebar-row drop on a color row + show the insertion indicator at
 *  the cursor's half (top = before, bottom = after). A note drag is accepted
 *  too and shows the whole-row note-drop highlight (assigns the color). */
function onColorDragOver(color: { id: string }, e: DragEvent): void {
  if (isNoteDrag(e)) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    noteDropOver.value = { kind: "color", id: color.id };
    return;
  }
  if (!isSidebarDrag(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  colorDropTarget.value = {
    id: color.id,
    position: e.clientY - rect.top < rect.height / 2 ? "before" : "after"
  };
}
/** Clear the color-row indicators when the pointer leaves it (guarded so a late
 *  `dragleave` from the previous row doesn't clear the newly-hovered row). */
function onColorDragLeave(color: { id: string }): void {
  if (noteDropOver.value?.kind === "color" && noteDropOver.value.id === color.id)
    noteDropOver.value = null;
  if (colorDropTarget.value?.id === color.id) colorDropTarget.value = null;
}
/** Drop another color onto this row: insert the dragged id before/after this
 *  row (top half = before, bottom half = after) — persists the full new id
 *  sequence via the colors store. A note drop sets this color on every dragged
 *  note (idempotent — a note keeps at most one color). Ignored for cross-section
 *  / same-row color drops. */
function onColorDrop(color: { id: string }, e: DragEvent): void {
  if (isNoteDrag(e)) {
    const payload = readNotePayload(e);
    noteDropOver.value = null;
    if (!payload) return;
    e.preventDefault();
    markNoteDropHandled();
    void properties.setColorMany(color.id, payload.ids).then(() => void collections.load());
    return;
  }
  const payload = readSidebarPayload(e);
  if (!payload || payload.section !== "colors" || payload.id === color.id) {
    if (colorDropTarget.value?.id === color.id) colorDropTarget.value = null;
    return;
  }
  e.preventDefault();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const before = e.clientY - rect.top < rect.height / 2;
  colorDropTarget.value = null;
  void colors.moveBefore(payload.id, color.id, before);
}

// --- Note drag targets (tag rows + Archive/Trash links) ---------------------
/** Shared `dragover` for the inline note-drop targets: allow the drop + show
 *  the whole-row highlight. `kind` selects the target, `id` disambiguates rows
 *  within the tag/color sections. */
function onNoteTargetDragOver(
  kind: "tag" | "color" | "archive" | "trash",
  id: string | undefined,
  e: DragEvent
): void {
  if (!isNoteDrag(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  noteDropOver.value = id ? { kind, id } : { kind };
}

/** Shared `dragleave`: clear the highlight only when it matches the row that
 *  was just left (so a late `dragleave` from the previous row doesn't wipe the
 *  newly-hovered one — same guard as the color/shortcut reorder handlers). */
function onNoteTargetDragLeave(
  kind: "tag" | "color" | "archive" | "trash",
  id: string | undefined
): void {
  const cur = noteDropOver.value;
  if (cur && cur.kind === kind && (id === undefined || cur.id === id))
    noteDropOver.value = null;
}

/** Drop notes on the Archive link → archive every dragged note. */
function onArchiveNoteDrop(e: DragEvent): void {
  if (!isNoteDrag(e)) return;
  const payload = readNotePayload(e);
  noteDropOver.value = null;
  if (!payload) return;
  e.preventDefault();
  markNoteDropHandled();
  void notes.archiveMany(payload.ids).then(() => void collections.load());
}

/** Drop notes on the Trash link → move every dragged note to trash. */
function onTrashNoteDrop(e: DragEvent): void {
  if (!isNoteDrag(e)) return;
  const payload = readNotePayload(e);
  noteDropOver.value = null;
  if (!payload) return;
  e.preventDefault();
  markNoteDropHandled();
  void notes.moveToTrashMany(payload.ids).then(() => void collections.load());
}

// --- Shortcuts manual drag-reorder (local-only via localStorage) -----------
/** Begin a sidebar drag of a shortcut/favourite row (carries `{section:
 *  "shortcuts", id}`). The id is the row id (notebook/tag id for shortcuts,
 *  note id for favourites). */
function onShortcutDragStart(sc: ShortcutMenuTarget, e: DragEvent): void {
  writeSidebarPayload(e, { section: "shortcuts", id: sc.id });
}
/** Allow a sidebar-row drop on a shortcut row + show the insertion indicator. */
function onShortcutDragOver(sc: ShortcutMenuTarget, e: DragEvent): void {
  if (!isSidebarDrag(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  shortcutDropTarget.value = {
    id: sc.id,
    position: e.clientY - rect.top < rect.height / 2 ? "before" : "after"
  };
}
/** Clear the shortcut-row indicator when the pointer leaves it. */
function onShortcutDragLeave(sc: ShortcutMenuTarget): void {
  if (shortcutDropTarget.value?.id === sc.id) shortcutDropTarget.value = null;
}
/** Drop another shortcut/favourite onto this row: insert the dragged id
 *  before/after this row, persisting the full new id sequence via the shortcuts
 *  store (local-only). Ignored for cross-section / same-row drops. */
function onShortcutDrop(sc: ShortcutMenuTarget, e: DragEvent): void {
  const payload = readSidebarPayload(e);
  if (!payload || payload.section !== "shortcuts" || payload.id === sc.id) {
    if (shortcutDropTarget.value?.id === sc.id) shortcutDropTarget.value = null;
    return;
  }
  e.preventDefault();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const before = e.clientY - rect.top < rect.height / 2;
  shortcutDropTarget.value = null;
  const next = moveIdTo(
    shortcutRows.value.map((r) => r.id),
    payload.id,
    sc.id,
    before
  );
  shortcuts.setOrder(next);
}

// --- section-header create (+) buttons -------------------------------------
/** Header `+` → create a new root notebook and enter inline-rename. The store
 *  creates the notebook + starts rename; `NotebookNode`'s rename watch focuses
 *  + selects the input on mount. */
function createNotebookFromHeader(): void {
  void collections.createNotebook();
}

/** Header `+` → create a new top-level tag and enter inline-rename (the store
 *  starts rename seeded with the leaf; `TagNode` focuses + selects it). */
function createTagFromHeader(): void {
  void collections.createTag();
}

/** Header `+` → create a new standalone color, then enter inline-rename.
 *  Color rename commit is view-layer (`onColorRenameCommit` → `colors.renameColor`),
 *  so the collections store just owns the shared `renaming` UI state; the color
 *  row's `focusTagRename` function-ref focuses + selects the input on mount. */
async function createColorFromHeader(): Promise<void> {
  const id = await colors.createColor();
  if (!id) return;
  // Seed with the actual created title (`createColor` suffixes to "New color 2"
  // etc. on a duplicate) so the input shows what was really created.
  const title = colors.items.find((c) => c.id === id)?.title ?? "New color";
  collections.startRename("color", id, title);
}

// --- section-header context menus (Reset manual order) ---------------------
/** Right-click the Notebooks header → a "Reset manual order" entry (disabled
 *  when no local manual order is stored). */
function onNotebooksHeaderContext(e: MouseEvent): void {
  const entries = buildSidebarSectionMenu("notebooks", {
    hasManualOrder: collections.notebookOrder.length > 0,
    resetOrder: () => collections.resetNotebookOrder()
  });
  contextMenu.show(entries, e.clientX, e.clientY, "section:notebooks");
}
/** Right-click the Colors header → a "Reset manual order" entry (disabled when
 *  no synced `sideBarOrder:colors` is stored). */
function onColorsHeaderContext(e: MouseEvent): void {
  const entries = buildSidebarSectionMenu("colors", {
    hasManualOrder: colors.order.length > 0,
    resetOrder: () => void colors.setOrder([])
  });
  contextMenu.show(entries, e.clientX, e.clientY, "section:colors");
}
/** Right-click the Shortcuts header → a "Reset manual order" entry (disabled
 *  when no local manual order is stored). */
function onShortcutsHeaderContext(e: MouseEvent): void {
  const entries = buildSidebarSectionMenu("shortcuts", {
    hasManualOrder: shortcuts.order.length > 0,
    resetOrder: () => shortcuts.resetOrder()
  });
  contextMenu.show(entries, e.clientX, e.clientY, "section:shortcuts");
}
</script>

<template>
  <nav class="flex h-full flex-col gap-1 overflow-y-auto bg-glass-surface p-2 text-sm">
    <!-- Plain top links (All Notes / Monographs / Archive) -->
    <RouterLink
      v-for="v in linkTopViews"
      :key="v.name"
      :to="v.path"
      class="titlebar-no-drag flex w-full items-center rounded-md px-2 py-1.5 text-left transition-colors"
      :class="[
        isActive(v.path)
          ? 'bg-glass-active text-text'
          : 'text-text hover:bg-glass-hover',
        v.name === 'archive' && noteDropOver?.kind === 'archive'
          ? 'ring-2 ring-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]'
          : ''
      ]"
      @click="v.name === 'all' ? showAllNotes() : undefined"
      @dragover="v.name === 'archive' && onNoteTargetDragOver('archive', undefined, $event)"
      @dragleave="v.name === 'archive' && onNoteTargetDragLeave('archive', undefined)"
      @drop="v.name === 'archive' && onArchiveNoteDrop($event)"
    >
      <span class="shrink-0">{{ v.label }}</span>
      <span
        v-if="v.name === 'archive' && collections.archiveCount > 0"
        class="ml-auto shrink-0 text-[10px] text-text-muted"
      >{{ collections.archiveCount }}</span>
      <span
        v-if="v.name === 'reminders' && reminders.activeItems.length > 0"
        class="ml-auto shrink-0 text-[10px] text-text-muted"
      >{{ reminders.activeItems.length }}</span>
    </RouterLink>

    <!-- Shortcuts section (expandable; pinned notebooks/tags + favourite
         notes). Favourite notes are merged in at the view layer — they're not
         `db.shortcuts` items (upstream disallows notes). -->
    <div v-if="shortcutRows.length > 0" class="mt-1">
      <button
        class="titlebar-no-drag flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-text-muted hover:bg-glass-hover"
        :class="isContextTarget('section:shortcuts') ? 'context-target-row' : ''"
        @click="shortcutsCollapsed = !shortcutsCollapsed"
        @contextmenu.prevent="onShortcutsHeaderContext"
      >
        <Icon
          name="chevron-right"
          :size="10"
          class="transition-transform"
          :class="shortcutsCollapsed ? '' : 'rotate-90'"
        />
        <span>{{ t("sidebar.shortcuts") }}</span>
        <span class="ml-auto text-[10px] text-text-muted">{{ shortcutRows.length }}</span>
      </button>
      <div v-if="!shortcutsCollapsed" class="mt-0.5 flex flex-col gap-0.5 pl-3">
        <div
          v-for="sc in shortcutRows"
          :key="sc.id"
          class="group relative flex items-center gap-1 rounded px-2 py-1 text-left text-[12px] transition-colors"
          :class="[
            isShortcutActive(sc)
              ? 'bg-glass-active text-text'
              : 'text-text hover:bg-glass-hover',
            isContextTarget(sc.id) ? 'context-target-row' : ''
          ]"
          draggable="true"
          @contextmenu.prevent="onShortcutContext(sc, $event)"
          @dragstart="onShortcutDragStart(sc, $event)"
          @dragover="onShortcutDragOver(sc, $event)"
          @dragleave="onShortcutDragLeave(sc)"
          @drop="onShortcutDrop(sc, $event)"
        >
          <!-- Drop indicator: a 2px accent line at the top (before) / bottom (after). -->
          <span
            v-if="shortcutDropTarget?.id === sc.id"
            class="pointer-events-none absolute inset-x-0 h-0.5 bg-[var(--accent)]"
            :class="shortcutDropTarget.position === 'before' ? '-top-px' : '-bottom-px'"
          />
          <button
            class="flex flex-1 items-center gap-1 truncate text-left"
            :title="sc.title"
            @click="openShortcut(sc)"
          >
            <span
              v-if="sc.type === 'color'"
              class="inline-block h-2.5 w-2.5 shrink-0 rounded-full thin-outline"
              :style="{ background: sc.colorCode }"
            />
            <Icon v-else :name="shortcutGlyph(sc.type)" :size="12" class="text-text-muted" />
            <span class="truncate">{{ sc.title }}</span>
          </button>
          <button
            class="titlebar-no-drag shrink-0 text-[10px] text-text-muted opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
            :title="sc.type === 'note' ? t('sidebar.removeFromFavourites') : t('sidebar.removeFromShortcuts')"
            @click="removeShortcut(sc)"
          >
            <Icon name="x" :size="10" />
          </button>
        </div>
      </div>
    </div>

    <!-- Notebooks section (expandable; pinned-first) -->
    <div class="mt-1">
      <button
        class="titlebar-no-drag group/section flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-text-muted hover:bg-glass-hover"
        :class="isContextTarget('section:notebooks') ? 'context-target-row' : ''"
        @click="collections.toggleSection('notebooks')"
        @contextmenu.prevent="onNotebooksHeaderContext"
      >
        <Icon
          name="chevron-right"
          :size="10"
          class="transition-transform"
          :class="collections.collapsed.notebooks ? '' : 'rotate-90'"
        />
        <span>{{ t("sidebar.notebooks") }}</span>
        <Icon
          name="plus"
          :size="12"
          class="ml-auto shrink-0 text-text-muted opacity-0 transition-opacity hover:text-text group-hover/section:opacity-100"
          :title="t('sidebar.newNotebook')"
          @click.stop="createNotebookFromHeader"
        />
        <span class="text-[10px] text-text-muted">{{ collections.notebookCount }}</span>
      </button>
      <div v-if="!collections.collapsed.notebooks" class="mt-0.5 flex flex-col gap-0.5">
        <NotebookNode
          v-for="node in collections.treeNotebooks"
          :key="node.item.id"
          :node="node"
          :depth="0"
        />
        <div
          v-if="collections.notebookCount === 0"
          class="px-2 py-1 text-[10px] text-text-muted"
        >
          {{ t("sidebar.noNotebooks") }}
        </div>
      </div>
    </div>

    <!-- Tags section (expandable; hierarchical — `/` in a tag title nests it,
         e.g. `task/todo` renders under a `task` parent via `TagNode.vue`). -->
    <div class="mt-1">
      <button
        class="titlebar-no-drag group/section flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-text-muted hover:bg-glass-hover"
        @click="collections.toggleSection('tags')"
      >
        <Icon
          name="chevron-right"
          :size="10"
          class="transition-transform"
          :class="collections.collapsed.tags ? '' : 'rotate-90'"
        />
        <span>{{ t("sidebar.tags") }}</span>
        <Icon
          name="plus"
          :size="12"
          class="ml-auto shrink-0 text-text-muted opacity-0 transition-opacity hover:text-text group-hover/section:opacity-100"
          :title="t('sidebar.newTag')"
          @click.stop="createTagFromHeader"
        />
        <span class="text-[10px] text-text-muted">{{ collections.tags.length }}</span>
      </button>
      <div v-if="!collections.collapsed.tags" class="mt-0.5 flex flex-col gap-0.5 pl-3">
        <TagNode
          v-for="node in collections.treeTags"
          :key="node.path"
          :node="node"
          :depth="0"
        />
        <div
          v-if="collections.tags.length === 0"
          class="px-2 py-1 text-[10px] text-text-muted"
        >
          {{ t("sidebar.noTags") }}
        </div>
      </div>
    </div>

    <!-- Colors section (expandable; flat). Each row is a swatch + title;
         clicking filters the notes list to that color's notes. Always shown
         (like Notebooks/Tags) with a "No colors" empty state, so the section
         is visible even before any color is created via the note-row menu. -->
    <div class="mt-1">
      <button
        class="titlebar-no-drag group/section flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-text-muted hover:bg-glass-hover"
        :class="isContextTarget('section:colors') ? 'context-target-row' : ''"
        @click="colorsCollapsed = !colorsCollapsed"
        @contextmenu.prevent="onColorsHeaderContext"
      >
        <Icon
          name="chevron-right"
          :size="10"
          class="transition-transform"
          :class="colorsCollapsed ? '' : 'rotate-90'"
        />
        <span>{{ t("sidebar.colors") }}</span>
        <Icon
          name="plus"
          :size="12"
          class="ml-auto shrink-0 text-text-muted opacity-0 transition-opacity hover:text-text group-hover/section:opacity-100"
          :title="t('sidebar.newColor')"
          @click.stop="createColorFromHeader"
        />
        <span class="text-[10px] text-text-muted">{{ colors.items.length }}</span>
      </button>
      <div v-if="!colorsCollapsed" class="mt-0.5 flex flex-col gap-0.5 pl-3">
        <button
          v-for="color in colors.items"
          :key="color.id"
          class="titlebar-no-drag group relative flex items-center gap-1.5 rounded px-2 py-1 text-left text-[12px] transition-colors"
          :class="[
            isSelected('color', color.id)
              ? 'bg-glass-active text-text'
              : 'text-text hover:bg-glass-hover',
            noteDropOver && noteDropOver.kind === 'color' && noteDropOver.id === color.id
              ? 'ring-2 ring-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]'
              : '',
            isContextTarget(color.id) ? 'context-target-row' : ''
          ]"
          draggable="true"
          @click="!isColorRenaming(color.id) && selectCollection('color', color.id)"
          @contextmenu.prevent="onColorContext(color, $event)"
          @dragstart="onColorDragStart(color, $event)"
          @dragover="onColorDragOver(color, $event)"
          @dragleave="onColorDragLeave(color)"
          @drop="onColorDrop(color, $event)"
        >
          <!-- Drop indicator: a 2px accent line at the top (before) / bottom (after). -->
          <span
            v-if="colorDropTarget?.id === color.id"
            class="pointer-events-none absolute inset-x-0 h-0.5 bg-[var(--accent)]"
            :class="colorDropTarget.position === 'before' ? '-top-px' : '-bottom-px'"
          />
          <span
            class="inline-block h-2.5 w-2.5 shrink-0 rounded-full thin-outline"
            :style="{ background: color.colorCode }"
          />
          <input
            v-if="isColorRenaming(color.id)"
            :ref="focusTagRename"
            :value="collections.renaming?.text ?? color.title"
            class="titlebar-no-drag min-w-0 flex-1 rounded-sm border border-glass-active bg-glass-surface px-1 py-0 text-[12px] text-text focus:outline-none"
            @input="onColorRenameInput"
            @click.stop
            @keydown.enter.prevent="onColorRenameCommit"
            @keydown.esc.prevent="onColorRenameCancel"
            @blur="onColorRenameCommit"
          />
          <template v-else>
            <span class="truncate">{{ color.title }}</span>
            <span
              class="ml-auto shrink-0 text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
              :class="colors.isFavoriteColor(color.id) ? 'text-amber-500 opacity-100' : 'text-text-muted'"
              :title="colors.isFavoriteColor(color.id) ? t('sidebar.removeFromShortcuts') : t('sidebar.addToShortcuts')"
              @click.stop="colors.toggleFavoriteColor(color.id)"
            ><Icon name="star" :size="10" :class="colors.isFavoriteColor(color.id) ? 'thin-outline' : ''" :fill="colors.isFavoriteColor(color.id) ? 'currentColor' : 'none'" /></span>
          </template>
        </button>
        <div v-if="colors.items.length === 0" class="px-2 py-1 text-[10px] text-text-muted">
          {{ t("sidebar.noColors") }}
        </div>
      </div>
    </div>

    <div class="flex-1" />

    <!-- Plain bottom links (Trash) -->
    <RouterLink
      v-for="v in linkBottomViews"
      :key="v.name"
      :to="v.path"
      class="titlebar-no-drag flex w-full items-center rounded-md px-2 py-1.5 text-left transition-colors"
      :class="[
        isActive(v.path)
          ? 'bg-glass-active text-text'
          : 'text-text-muted hover:bg-glass-hover',
        v.name === 'trash' && noteDropOver?.kind === 'trash'
          ? 'ring-2 ring-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]'
          : ''
      ]"
      @dragover="v.name === 'trash' && onNoteTargetDragOver('trash', undefined, $event)"
      @dragleave="v.name === 'trash' && onNoteTargetDragLeave('trash', undefined)"
      @drop="v.name === 'trash' && onTrashNoteDrop($event)"
    >
      <span class="shrink-0">{{ v.label }}</span>
      <span
        v-if="v.name === 'trash' && collections.trashCount > 0"
        class="ml-auto shrink-0 text-[10px] text-text-muted"
      >{{ collections.trashCount }}</span>
    </RouterLink>

    <!-- Settings opens its own window (singleton) via IPC, not a route. -->
    <button
      class="titlebar-no-drag rounded-md px-2 py-1.5 text-left text-text-muted transition-colors hover:bg-glass-hover"
      @click="openSettings"
    >
      Settings
    </button>

    <!-- Account area: email + a row with Log out (left) and the sync status
         (right). Sync text is derived in the script via `syncStatusText`. -->
    <div v-if="auth.isLoggedIn" class="mt-1 rounded-md bg-glass-surface px-2 py-1.5">
      <div class="truncate text-[11px] text-text-muted">{{ auth.user?.email }}</div>
      <div class="mt-1 flex items-center justify-between gap-2">
        <button
          class="rounded px-1 py-0.5 text-left text-[10px] text-text-muted hover:bg-glass-hover"
          @click="auth.logout()"
        >
          Log out
        </button>
        <span class="shrink-0 text-[10px] text-text-muted" :title="syncText">{{ syncText }}</span>
      </div>
    </div>
    <div v-else class="mt-1 flex items-center gap-1.5">
      <button
        class="rounded-md px-2 py-1.5 text-left text-[11px] text-text-muted hover:bg-glass-hover"
        @click="auth.requestSignIn()"
      >
        Sign in
      </button>
      <!-- Local-only chip: shown only while in local mode (`skippedLogin` is the
           sole login gate there). Disappears once Sign in re-arms the login screen. -->
      <span
        v-if="auth.skippedLogin"
        class="shrink-0 rounded-full bg-glass-surface px-2 py-0.5 text-[10px] text-text-muted"
        title="Your notes stay on this device and don't sync. Sign in to sync across devices."
        >Local only</span
      >
    </div>

  </nav>
</template>