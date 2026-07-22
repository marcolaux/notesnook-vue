<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon } from "@notesnook-vue/ui-vue";
import { useNotesStore } from "@/stores/notes";
import { useCollectionsStore } from "@/stores/collections";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { usePropertiesStore } from "@/stores/properties";
import { useColorsStore } from "@/stores/colors";
import { useContextMenuStore } from "@/stores/context-menu";
import { useColorDialogStore } from "@/stores/color-dialog";
import { useReminderDialogStore } from "@/stores/reminder-dialog";
import { useRemindersStore } from "@/stores/reminders";
import { useDialogStore } from "@/stores/dialog";
import { usePublishStore } from "@/stores/publish";
import { usePublishDialogStore } from "@/stores/publish-dialog";
import { formatPublishUrl } from "@/utils/publish";
import { getDatabase } from "@/platform/bootstrap";
import { desktop } from "@/platform/desktop-bridge";
import { DefaultColors } from "@notesnook-vue/contracts";
import { groupNotes, highlightSegments, type SortKey, type GroupKey } from "@/utils/notes-list";
import {
  buildNoteMenu,
  buildMultiNoteMenu,
  type NoteMenuTarget,
  type MultiMenuSelection,
  type MultiNoteMenuDeps
} from "@/utils/context-menu-entries";
import type { MenuItem } from "@/utils/context-menu";
import { toColorListItem } from "@/utils/colors";
import {
  writeNotePayload,
  resetNoteDropHandled,
  consumeNoteDropHandled
} from "@/utils/note-dnd";
import type { NotePreview } from "@/utils/note-preview";
import type { NoteListItem } from "@/stores/notes";

const notes = useNotesStore();
const collections = useCollectionsStore();
const layout = useEditorLayoutStore();
const properties = usePropertiesStore();
const colors = useColorsStore();
const contextMenu = useContextMenuStore();
const colorDialog = useColorDialogStore();
const reminderDialog = useReminderDialogStore();
const reminders = useRemindersStore();
const dialog = useDialogStore();
const publish = usePublishStore();
const publishDialog = usePublishDialogStore();

/** Core's `DefaultColors` (name → hex) as title-cased preset entries for the
 *  Color submenu — picking one creates the color in the db + assigns it. */
const presetColors = Object.entries(DefaultColors).map(([name, code]) => ({
  id: code,
  title: name.charAt(0).toUpperCase() + name.slice(1),
  colorCode: code
}));

/** In-flight note drag: the OS screen point where it started + the grabbed
 *  note id. The grabbed note is what a cross-window release opens (one note →
 *  one window, matching tab tear-off); the rest of the selection only travels
 *  with the payload for sidebar assignment drops. Cleared on `dragend`. */
const noteDragStart = ref<{ x: number; y: number; noteId: string } | null>(null);

/** Grouped view of the sorted+filtered list. Flat mode returns one headerless
 * group so the template iterates uniformly; `none` never shows a header. */
const groups = computed(() => groupNotes(notes.visibleItems, notes.groupKey));

/** Label for the active collection-filter chip. The collections store's
 *  `selectedLabel` covers notebook/tag (it owns those lists); color selection
 *  is resolved here from the colors store so the collections store stays
 *  color-agnostic. */
const collectionLabel = computed(() => {
  const s = collections.selected;
  if (s?.type === "color") return colors.items.find((c) => c.id === s.id)?.title ?? "Color";
  return collections.selectedLabel;
});

/** Typed lookup of a note's list preview (thumbnail + checklist progress). */
function previewOf(id: string): NotePreview | undefined {
  return notes.previews[id];
}

/** Progress-bar width (%) for a note's checklist, or 0 when none. */
function progressWidth(preview: NotePreview): number {
  const c = preview.checklist;
  if (!c || c.total === 0) return 0;
  return (c.checked / c.total) * 100;
}

/** Search-match segments for a note field (empty query → one plain run, so
 * the `<mark>` only renders while a search is active). */
function segmentsOf(text: string): { text: string; match: boolean }[] {
  return highlightSegments(text, notes.query, { regex: notes.regexSearch });
}

/** Clear the active collection filter (chip × or "All Notes"). */
function clearCollectionFilter(): void {
  notes.clearCollectionFilter();
  collections.clearSelection();
}

/** Whether a row should render the multi-selection treatment (accent bg +
 *  ring + checkmark). Only when MORE than one note is selected — so a lone
 *  selection never reads as "multi-select". This matters for right-click:
 *  `onNoteContext` reconciles the selection to the right-clicked row (so its
 *  menu acts on that note), but a single selected row that isn't the open
 *  note must NOT light up as if it were multi-selected; the active note keeps
 *  its `bg-glass-active` "open" highlight, and the lone non-active selection
 *  shows no special treatment. When count > 1, every selected row (including
 *  the active one) joins the treatment so the whole set reads as one. */
function noteRowSelected(id: string): boolean {
  return notes.isSelected(id) && notes.selectedCount > 1;
}

/** Whether a row is the target of the currently-open context menu — so it
 *  keeps a dashed outline while the menu is open, marking which note the menu
 *  acts on (the menu floats away from the row, so without it the target is
 *  ambiguous once the cursor moves to the menu). Cleared by `close` + every
 *  `show`, so it never lingers after the menu closes or switches source. */
function noteRowContext(id: string): boolean {
  return contextMenu.contextId === id;
}

/** Plain / cmd / shift click on a note row (file-manager semantics):
 *  shift → range-select from the anchor (no open); cmd/ctrl → toggle
 *  membership (no open); plain → collapse selection to the note AND open it. */
function onNoteClick(note: NoteListItem, e: MouseEvent): void {
  if (e.shiftKey) return notes.extendSelection(note.id);
  if (e.metaKey || e.ctrlKey) return notes.toggleSelection(note.id);
  notes.selectOnly(note.id);
}

/** Begin dragging a note row (file-manager semantics): when the grabbed row is
 *  part of the current multi-selection the whole selection travels with the
 *  drag; otherwise the drag carries just this note and the selection collapses
 *  to it so the highlight matches the dragged set. The payload is read by
 *  sidebar drop targets (Notebook / Tag / Color / Archive / Trash) AND the
 *  editor-area drop targets (tab strip, editor-pane split zone). Records the
 *  start screen point + grabbed note id so `onNoteDragEnd` can tear off into a
 *  new window when the drag is released outside every window (mirroring tab
 *  tear-off via `desktop.window.releaseTab`).
 *
 *  The selection collapse uses `setSelection` (NOT `selectOnly`) deliberately:
 *  `selectOnly` also calls `layout.openNote`, which would open the grabbed note
 *  in the active pane the instant the drag starts — defeating a drag onto
 *  another pane/tab strip (the note would already be a tab there, so the drop
 *  target's `openTab` would reuse it in place and an edge-split would create an
 *  empty sibling). `setSelection` selects without any editor effect, so the
 *  drag truly carries the note without opening it. Plain-click still opens via
 *  `onNoteClick → selectOnly`; only the drag path is opening-free. */
function onNoteDragStart(note: NoteListItem, e: DragEvent): void {
  const ids = notes.isSelected(note.id) ? [...notes.selectedNoteIds] : [note.id];
  if (!notes.isSelected(note.id)) notes.setSelection([note.id]);
  writeNotePayload(e, { ids });
  resetNoteDropHandled();
  noteDragStart.value = { x: e.screenX, y: e.screenY, noteId: note.id };
}

/** A note drag released outside every window (or over another app window) opens
 *  the grabbed note in a new window / the target window — the same
 *  `desktop.window.releaseTab` path tab tear-off uses (main resolves moved-vs-
 *  toreOff from the live cursor + every window's OS bounds). Skipped when a
 *  within-window sidebar target already consumed the drop (an assignment).
 *  Unlike a tab tear-off, there is no source tab to close — the note stays put
 *  in this window; the drag simply additionally opens it elsewhere. */
async function onNoteDragEnd(): Promise<void> {
  const start = noteDragStart.value;
  noteDragStart.value = null;
  if (!start) return;
  if (consumeNoteDropHandled()) return; // a sidebar assignment handled it
  try {
    await desktop.window.releaseTab.mutate({
      noteId: start.noteId,
      startScreenX: start.x,
      startScreenY: start.y
    });
  } catch {
    // main unreachable — leave the note in place
  }
}

/** From a bulk `db.relations.to({type:"note",ids}, type).get()` result, compute
 *  the set of `fromId`s (tag / notebook / color ids) present on EVERY note in
 *  `ids` (count === ids.length). Used to seed the multi-menu submenu `checked`
 *  states + toggle direction. */
function allHaveSet(rels: { fromId: string; toId: string }[], ids: string[]): Set<string> {
  const noteSet = new Set(ids);
  const counts = new Map<string, Set<string>>();
  for (const r of rels) {
    if (!noteSet.has(r.toId)) continue;
    let s = counts.get(r.fromId);
    if (!s) {
      s = new Set();
      counts.set(r.fromId, s);
    }
    s.add(r.toId);
  }
  const all = new Set<string>();
  for (const [fromId, s] of counts) if (s.size === ids.length) all.add(fromId);
  return all;
}

/** The single color id shared by ALL selected notes, or `null` when they
 *  differ / have none. A note has at most one color, so at most one colorId can
 *  cover the whole selection. */
function commonColorId(rels: { fromId: string; toId: string }[], ids: string[]): string | null {
  const all = allHaveSet(rels, ids);
  for (const id of all) return id;
  return null;
}

/** Right-click a note row → show the per-note OR multi-selection context menu.
 *
 *  If the right-clicked row is part of an existing multi-selection (size > 1),
 *  the menu acts on the whole selection (bulk actions). If it is NOT selected,
 *  the selection collapses to that row and the single-note menu is shown. The
 *  single-note path fetches that note's assignment snapshot (Color / Tags /
 *  Notebooks `checked` states) via `db.relations.to(note, …)`; the multi path
 *  fetches per-assignment "all selected notes have it" sets via a single bulk
 *  `db.relations.to({type:"note",ids}, …).get()` per type. In both paths the
 *  submenu toggle callbacks mutate a mutable snapshot so a `keepOpen` toggle's
 *  ✓ flips live when the store rebuilds the submenu. On any fetch failure the
 *  menu still opens with empty checks. */
async function onNoteContext(
  note: { id: string; title: string; pinned: boolean; favorite: boolean },
  e: MouseEvent
): Promise<void> {
  // Reconcile selection: right-clicking outside the selection collapses to the
  // clicked row (mirrors file managers).
  if (!notes.isSelected(note.id)) notes.setSelection([note.id]);

  if (notes.selectedCount > 1) {
    const ids = [...notes.selectedNoteIds];
    const entries = await buildMultiEntries(ids);
    contextMenu.show(entries, e.clientX, e.clientY, note.id);
    return;
  }

  // The minimal row state the template passes ({id, pinned, favorite}); fetch
  // the assignment snapshot for the submenu checked states.
  const db = getDatabase();
  const ref = { id: note.id, type: "note" as const };
  let colorId: string | null = null;
  let tagIds: string[] = [];
  let notebookIds: string[] = [];
  let published = false;
  try {
    const [colorItems, tagItems, notebookItems] = await Promise.all([
      db.relations.to(ref, "color").resolve().catch(() => []),
      db.relations.to(ref, "tag").resolve().catch(() => []),
      db.relations.to(ref, "notebook").resolve().catch(() => []),
      // Repopulate the in-memory monographs cache so `isPublished` is accurate
      // for a note published in another window/process (core events are
      // per-process; the cache may be stale until the next sync refresh).
      db.monographs.refresh().catch(() => undefined)
    ]);
    colorId = (colorItems as { id: string }[])[0]?.id ?? null;
    tagIds = (tagItems as { id: string }[]).map((t) => t.id);
    notebookIds = (notebookItems as { id: string }[]).map((n) => n.id);
    published = db.monographs.isPublished(note.id);
  } catch {
    // leave the snapshot empty — the menu opens without checks
  }

  // The mutable snapshot the submenu builders close over. The keepOpen toggle
  // callbacks mutate it so the store's `refreshSubmenu` rebuild shows the new ✓.
  const target: NoteMenuTarget = { ...note, published, colorId, tagIds, notebookIds };

  const entries = buildNoteMenu(target, {
    openInWindow: (id) => {
      void desktop.window.openNote.mutate({ noteId: id }).catch(() => undefined);
    },
    openInSplit: (id, zone) => {
      // `openNoteSplit` splits the active group + opens the note in the new
      // sibling; a no-op active group (none open) is fine — `init()` seeds one.
      layout.openNoteSplit(layout.activeGroupId, id, zone);
    },
    togglePinned: (id) => void properties.toggle("pinned", id),
    toggleFavorite: (id) => void properties.toggle("favorite", id),
    colors: colors.items.map(toColorListItem),
    setColor: (colorId2, noteId) => {
      target.colorId = colorId2;
      void properties.setColor(colorId2, noteId);
    },
    clearColor: (noteId) => {
      target.colorId = null;
      void properties.clearColor(noteId);
    },
    presetColors,
    assignPresetColor: (title, colorCode, noteId) => {
      // Create the color in the db (upsert by colorCode) then assign it to the
      // note. Optimistically set the snapshot so the ✓ is right even before the
      // db round-trip; the real id from `colors.add` replaces it on resolve.
      void colors.add({ title, colorCode }).then((id) => {
        if (id) {
          target.colorId = id;
          void properties.setColor(id, noteId);
        }
      });
    },
    createColor: (noteId) => {
      // Open the editor dialog; on Create, add the color + assign it.
      void colorDialog.openCreate().then((result) => {
        if (!result) return;
        void colors.add(result).then((id) => {
          if (id) {
            target.colorId = id;
            void properties.setColor(id, noteId);
          }
        });
      });
    },
    tags: collections.tags.map((t) => ({ id: t.id, title: t.title })),
    addTag: (tagId, noteId) => {
      if (!target.tagIds.includes(tagId)) target.tagIds = [...target.tagIds, tagId];
      void properties.addTag(tagId, noteId);
    },
    removeTag: (tagId, noteId) => {
      target.tagIds = target.tagIds.filter((x) => x !== tagId);
      void properties.removeTag(tagId, noteId);
    },
    createTag: (title, noteId) => {
      void properties.createTag(title, noteId).then((created) => {
        if (created && !target.tagIds.includes(created.id)) target.tagIds = [...target.tagIds, created.id];
        void collections.load();
      });
    },
    notebooks: collections.notebooks.map((n) => ({ id: n.id, title: n.title })),
    addNotebook: (notebookId, noteId) => {
      if (!target.notebookIds.includes(notebookId)) target.notebookIds = [...target.notebookIds, notebookId];
      void properties.addNotebook(notebookId, noteId);
    },
    removeNotebook: (notebookId, noteId) => {
      target.notebookIds = target.notebookIds.filter((x) => x !== notebookId);
      void properties.removeNotebook(notebookId, noteId);
    },
    createNotebook: (title, noteId) => {
      void properties.createNotebook(title, noteId).then((created) => {
        if (created && !target.notebookIds.includes(created.id)) target.notebookIds = [...target.notebookIds, created.id];
        void collections.load();
      });
    },
    confirm: (opts) => dialog.confirm(opts),
    // Move to trash, close the note's tab(s), reload the list, and refresh the
    // sidebar's trash count (it lives in the collections store).
    deleteNote: (id) => {
      void notes.moveToTrash(id).then(() => void collections.load());
    },
    // Archive the note (drops it from All Notes; reversible via Unarchive),
    // then refresh the sidebar archive badge (lives in the collections store).
    archiveNote: (id) => {
      void notes.archive(id).then(() => void collections.load());
    },
    // "Remind me…": open the reminder dialog seeded with the note's title +
    // `nn://note/<id>` description; on confirm, create the reminder + link it
    // to the note (the store's `add` establishes the reminder↔note relation).
    remindMe: (noteId, noteTitle) => {
      void reminderDialog.openCreateForNote(noteId, noteTitle).then((input) => {
        if (input) void reminders.add(input);
      });
    },
    // Publish-to-web: open the publish dialog seeded with the note's title; on
    // confirm, publish via the publish store's explicit-id action (works for a
    // right-clicked note that is not the active note). `target.published` is set
    // optimistically so the menu shows the published state if re-opened.
    publishNote: (noteId, noteTitle) => {
      void publishDialog.openCreate(noteId, noteTitle).then((input) => {
        if (!input) return;
        const { title, ...opts } = input;
        void publish.publishById(noteId, title, opts).then((ok) => {
          if (ok) target.published = true;
        });
      });
    },
    // Unpublish (confirm is composed by the builder). Optimistically clear.
    unpublishNote: (noteId) => {
      void publish.unpublishById(noteId).then((ok) => {
        if (ok) target.published = false;
      });
    },
    // Copy the authoritative server-returned `Monograph.publishUrl`.
    copyMonographUrl: (noteId) => {
      void (async () => {
        const m = await db.monographs.get(noteId);
        const url = formatPublishUrl(m);
        if (url) void navigator.clipboard.writeText(url);
      })();
    },
    // Open in the system browser (`window.open` → `shell.openExternal`).
    openMonograph: (noteId) => {
      void (async () => {
        const m = await db.monographs.get(noteId);
        const url = formatPublishUrl(m);
        if (url) window.open(url, "_blank", "noopener");
      })();
    }
  });
  contextMenu.show(entries, e.clientX, e.clientY, note.id);
}

/** Build the multi-selection context menu for `ids`: fetch the per-assignment
 *  "all selected notes have it" sets (one bulk `db.relations.to(...).get()` per
 *  type) + the shared color, then build the menu with callbacks that mutate the
 *  mutable `sel` snapshot so `keepOpen` submenu toggles flip their ✓ live. */
async function buildMultiEntries(ids: string[]): Promise<MenuItem[]> {
  const db = getDatabase();
  const refs = { type: "note" as const, ids };
  let tagAllHave = new Set<string>();
  let notebookAllHave = new Set<string>();
  let colorId: string | null = null;
  try {
    const [tagRels, notebookRels, colorRels] = await Promise.all([
      db.relations.to(refs, "tag").get().catch(() => []),
      db.relations.to(refs, "notebook").get().catch(() => []),
      db.relations.to(refs, "color").get().catch(() => [])
    ]);
    tagAllHave = allHaveSet(tagRels as { fromId: string; toId: string }[], ids);
    notebookAllHave = allHaveSet(notebookRels as { fromId: string; toId: string }[], ids);
    colorId = commonColorId(colorRels as { fromId: string; toId: string }[], ids);
  } catch {
    // leave empty — the menu opens without checks
  }

  // Mutable snapshot the submenu builders close over; keepOpen toggle callbacks
  // mutate it so the store's `refreshSubmenu` rebuild shows the new ✓.
  const sel: MultiMenuSelection = { ids, tagAllHave, notebookAllHave, colorId };

  const multiDeps: MultiNoteMenuDeps = {
    confirm: (opts) => dialog.confirm(opts),
    deleteMany: (idz) => {
      void notes.moveToTrashMany(idz).then(() => void collections.load());
    },
    archiveMany: (idz) => {
      void notes.archiveMany(idz).then(() => void collections.load());
    },
    setPinned: (idz, state) => void properties.setToggleMany("pinned", idz, state),
    setFavorite: (idz, state) => void properties.setToggleMany("favorite", idz, state),
    colors: colors.items.map(toColorListItem),
    presetColors,
    setColorMany: (colorId2, idz) => {
      sel.colorId = colorId2;
      void properties.setColorMany(colorId2, idz);
    },
    clearColorMany: (idz) => {
      sel.colorId = null;
      void properties.clearColorMany(idz);
    },
    assignPresetColorMany: (title, colorCode, idz) => {
      void colors.add({ title, colorCode }).then((id) => {
        if (id) {
          sel.colorId = id;
          void properties.setColorMany(id, idz);
        }
      });
    },
    createColorMany: (idz) => {
      void colorDialog.openCreate().then((result) => {
        if (!result) return;
        void colors.add(result).then((id) => {
          if (id) {
            sel.colorId = id;
            void properties.setColorMany(id, idz);
          }
        });
      });
    },
    tags: collections.tags.map((t) => ({ id: t.id, title: t.title })),
    addTagToMany: (tagId, idz) => {
      sel.tagAllHave.add(tagId);
      void properties.addTagToMany(tagId, idz);
    },
    removeTagToMany: (tagId, idz) => {
      sel.tagAllHave.delete(tagId);
      void properties.removeTagToMany(tagId, idz);
    },
    createTagMany: (title, idz) => {
      void properties.createTagMany(title, idz).then(() => void collections.load());
    },
    notebooks: collections.notebooks.map((n) => ({ id: n.id, title: n.title })),
    addToNotebookMany: (notebookId, idz) => {
      sel.notebookAllHave.add(notebookId);
      void properties.addToNotebookMany(notebookId, idz);
    },
    removeFromNotebookMany: (notebookId, idz) => {
      sel.notebookAllHave.delete(notebookId);
      void properties.removeFromNotebookMany(notebookId, idz);
    },
    createNotebookMany: (title, idz) => {
      void properties.createNotebookMany(title, idz).then(() => void collections.load());
    },
    duplicateMany: (idz) => {
      void notes.duplicateMany(idz);
    }
  };

  return buildMultiNoteMenu(sel, multiDeps);
}

const sortKeys: { value: SortKey; label: string }[] = [
  { value: "dateEdited", label: "Modified" },
  { value: "dateCreated", label: "Created" },
  { value: "title", label: "Title" }
];

const groupKeys: { value: GroupKey; label: string }[] = [
  { value: "none", label: "No grouping" },
  { value: "date", label: "Date" }
];

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
</script>

<template>
  <div class="flex h-full flex-col bg-glass-surface">
    <!-- The search input moved to the title bar (global search); this header
         row now only holds the New Note button + the count/sort/selection
         readouts. -->
    <div class="flex h-7 shrink-0 items-center gap-2 border-b border-glass-border px-3 text-[10px] text-text-muted">
      <button
        class="titlebar-no-drag grid h-5 w-5 place-items-center rounded-sm text-text-muted hover:bg-glass-hover"
        title="New Note"
        @click="notes.create()"
      >
        <Icon name="plus" :size="14" />
      </button>
      <span class="shrink-0">{{ notes.visibleItems.length }}</span>
      <!-- Multi-selection readout: "N selected" with a Clear button. Shown only
           while more than one note is selected. -->
      <span
        v-if="notes.selectedCount > 1"
        class="titlebar-no-drag flex shrink-0 items-center gap-1 rounded-full bg-glass-hover px-1.5 py-0.5 text-text-muted"
      >
        <span>{{ notes.selectedCount }} selected</span>
        <button
          class="grid h-3.5 w-3.5 place-items-center rounded-full text-text-muted hover:bg-glass-active hover:text-text"
          title="Clear selection"
          @click="notes.clearSelection()"
        >
          <Icon name="x" :size="8" :stroke-width="3" />
        </button>
      </span>
      <!-- Active collection filter (notebook/tag/color) with a clear (×) button. -->
      <span
        v-if="notes.collectionFilter && collectionLabel"
        class="titlebar-no-drag flex shrink-0 items-center gap-1 rounded-full bg-glass-hover px-1.5 py-0.5 text-text-muted"
      >
        <span
          v-if="collections.selected?.type === 'color'"
          class="inline-block h-2 w-2 shrink-0 rounded-full"
          :style="{ background: colors.items.find((c) => c.id === collections.selected!.id)?.colorCode }"
        />
        <span class="max-w-[10rem] truncate">{{ collectionLabel }}</span>
        <button
          class="grid h-3.5 w-3.5 place-items-center rounded-full text-text-muted hover:bg-glass-active hover:text-text"
          title="Clear collection filter"
          @click="clearCollectionFilter()"
        >
          <Icon name="x" :size="8" :stroke-width="3" />
        </button>
      </span>
      <span class="ml-auto flex items-center gap-1">
        <select
          class="titlebar-no-drag rounded-sm border border-glass-border bg-glass-surface px-1 py-0.5 text-text-muted focus:outline-none"
          :value="notes.groupKey"
          title="Group by"
          @change="notes.setGroupKey(($event.target as HTMLSelectElement).value as GroupKey)"
        >
          <option v-for="g in groupKeys" :key="g.value" :value="g.value">{{ g.label }}</option>
        </select>
        <select
          class="titlebar-no-drag rounded-sm border border-glass-border bg-glass-surface px-1 py-0.5 text-text-muted focus:outline-none"
          :value="notes.sortKey"
          title="Sort by"
          @change="notes.setSortKey(($event.target as HTMLSelectElement).value as SortKey)"
        >
          <option v-for="k in sortKeys" :key="k.value" :value="k.value">{{ k.label }}</option>
        </select>
        <button
          class="titlebar-no-drag grid h-5 w-5 place-items-center rounded-sm text-text-muted hover:bg-glass-hover"
          :title="notes.sortDir === 'asc' ? 'Ascending' : 'Descending'"
          @click="notes.toggleSortDir()"
        >
          <Icon :name="notes.sortDir === 'asc' ? 'arrow-up' : 'arrow-down'" :size="10" />
        </button>
      </span>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-1">
      <template v-for="group in groups" :key="group.key">
        <div
          v-if="group.label"
          class="sticky top-0 z-10 bg-glass-surface px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-text-muted"
        >
          {{ group.label }}
        </div>
        <button
          v-for="note in group.items"
          :key="note.id"
          class="note-row block w-full rounded-md px-2 py-1.5 text-left hover:bg-glass-hover"
          :class="{
            'bg-glass-active': notes.activeNote?.id === note.id && !noteRowSelected(note.id),
            'note-row-selected': noteRowSelected(note.id),
            'context-target-row': noteRowContext(note.id),
            'has-tint': !!note.color
          }"
          :style="note.color ? { '--note-tint': note.color.colorCode } : undefined"
          draggable="true"
          @click="onNoteClick(note, $event)"
          @contextmenu.prevent="onNoteContext(note, $event)"
          @dragstart="onNoteDragStart(note, $event)"
          @dragend="onNoteDragEnd"
        >
          <div class="flex items-center gap-1">
            <!-- Multi-selection checkmark (shown when the row is part of the
                 multi-selection but is not the open/active note — the active
                 note already shows bg-glass-active). -->
            <Icon
              v-if="noteRowSelected(note.id)"
              name="check"
              :size="10"
              class="text-blue-400"
              title="Selected"
            />
            <Icon v-if="note.pinned" name="pin" :size="10" class="text-amber-300/80" fill="currentColor" title="Pinned" />
            <Icon v-if="note.favorite" name="star" :size="10" class="text-amber-300/80 thin-outline" fill="currentColor" title="Favorite" />
            <Icon v-if="notes.publishedIds.has(note.id)" name="globe" :size="10" class="text-text-muted" title="Published" />
            <span class="truncate text-xs font-medium text-text">
              <template v-for="(seg, i) in segmentsOf(note.title)" :key="i">
                <mark v-if="seg.match" class="rounded-sm bg-amber-400/30 px-0.5 text-text">{{ seg.text }}</mark>
                <template v-else>{{ seg.text }}</template>
              </template>
            </span>
          </div>
          <div class="mt-1 flex items-start gap-2">
            <!-- First-image thumbnail (attachment-backed images resolve in Phase 6). -->
            <img
              v-if="previewOf(note.id)?.thumbnail"
              :src="previewOf(note.id)!.thumbnail ?? undefined"
              alt=""
              class="h-8 w-8 shrink-0 rounded-sm object-cover"
              draggable="false"
            />
            <div class="min-w-0 flex-1">
              <div class="truncate text-[10px] text-text-muted">
                <template v-if="note.headline">
                  <template v-for="(seg, i) in segmentsOf(note.headline)" :key="i">
                    <mark v-if="seg.match" class="rounded-sm bg-amber-400/30 px-0.5 text-text-muted">{{ seg.text }}</mark>
                    <template v-else>{{ seg.text }}</template>
                  </template>
                </template>
                <template v-else>No additional text</template>
              </div>
            </div>
          </div>
          <!-- Date + checklist progress share one line; tags wrap to a new
               line when the row is too narrow to fit them alongside. The tag
               group is a single shrink-0 flex item, so flex-wrap drops the
               whole group at once (rather than splitting individual tags);
               max-w-full + internal flex-wrap keeps tags from overflowing on
               very narrow rows. -->
          <div class="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9px] text-text-muted">
            <span class="shrink-0">{{ formatDate(note.dateEdited) }}</span>
            <template v-if="previewOf(note.id)?.checklist && previewOf(note.id)!.checklist!.total > 0">
              <div class="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-glass-hover">
                <div
                  class="h-full rounded-full bg-emerald-400/70"
                  :style="{ width: `${progressWidth(previewOf(note.id)!)}%` }"
                />
              </div>
              <span class="shrink-0 text-[8px] text-text-muted">
                {{ previewOf(note.id)!.checklist!.checked }}/{{ previewOf(note.id)!.checklist!.total }}
              </span>
            </template>
            <span
              v-if="note.tags.length"
              class="flex max-w-full shrink-0 flex-wrap gap-1"
            >
              <span
                v-for="tag in note.tags.slice(0, 3)"
                :key="tag"
                class="shrink-0 rounded-sm bg-glass-hover px-1 text-[8px] text-text-muted"
              >#{{ tag }}</span>
            </span>
          </div>
        </button>
      </template>
      <div v-if="notes.visibleItems.length === 0 && notes.query" class="px-2 py-4 text-center text-[10px] text-text-muted">
        No notes match “{{ notes.query }}”
      </div>
      <div v-else-if="notes.items.length === 0" class="px-2 py-4 text-center text-[10px] text-text-muted">
        No notes yet
      </div>
    </div>
  </div>
</template>

<style scoped>
/* A note row with an assigned color gets a subtle tinted background (a "slight
   version" of the color for readability). The raw color is passed as the
   `--note-tint` CSS var; `color-mix` overlays it at low alpha for the rest,
   higher on hover, highest when active — so the tint reads at a glance without
   swamping the text. These rules outrank the Tailwind hover/active bg classes
   for tinted rows (higher specificity), and fall through to them otherwise. */
.note-row.has-tint {
  background-color: color-mix(in srgb, var(--note-tint) 14%, transparent);
}
.note-row.has-tint:hover {
  background-color: color-mix(in srgb, var(--note-tint) 22%, transparent);
}
.note-row.has-tint.bg-glass-active {
  background-color: color-mix(in srgb, var(--note-tint) 32%, transparent);
}
/* A row that is part of the multi-selection (but not the open/active note, which
   shows bg-glass-active). A subtle accent bg + a ring so a selected+ tinted
   row still reads as selected (the tint's bg rules above win for tinted rows,
   so the ring carries the selection signal there). */
.note-row.note-row-selected {
  background-color: color-mix(in srgb, var(--color-accent, #3b82f6) 18%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-accent, #3b82f6) 50%, transparent);
}
</style>