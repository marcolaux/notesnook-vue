/**
 * Reusable note context-menu composable — the single source of truth for the
 * right-click menu shown on a note row. Extracted from `NotesList.vue`'s
 * `onNoteContext` / `buildMultiEntries` so the Daily Notes timeline + references
 * panel can show the EXACT same menu as the notes list without duplicating the
 * ~15 store deps + assignment-snapshot fetch.
 *
 * The menu entries themselves are built by the pure builders in
 * `utils/context-menu-entries.ts` (`buildNoteMenu` / `buildMultiNoteMenu`); this
 * composable owns only the dep wiring (the store/bridge methods the builders
 * close over) + the per-right-click snapshot fetch (`db.relations.to(note, …)`
 * for the submenu `checked` states, `db.monographs.refresh` for the published
 * flag) + the `contextMenu.show` call.
 *
 * `showNoteMenu(note, e)` takes the minimal row state ({id, title, pinned,
 * favorite}) — the same shape `NotesList`'s row passes — fetches the assignment
 * snapshot, builds the single-note menu, and opens the overlay tagged with the
 * note's id (so the originating list can keep an outline on that row).
 * `showMultiNoteMenu(ids, e)` builds the bulk menu for a multi-selection.
 */
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
import { useAuthStore } from "@/stores/auth";
import { formatPublishUrl } from "@/utils/publish";
import { getDatabase } from "@/platform/bootstrap";
import { desktop } from "@/platform/desktop-bridge";
import { DefaultColors } from "@notesnook-vue/contracts";
import {
  buildNoteMenu,
  buildMultiNoteMenu,
  type NoteMenuTarget,
  type MultiMenuSelection,
  type MultiNoteMenuDeps
} from "@/utils/context-menu-entries";
import type { MenuItem } from "@/utils/context-menu";
import { toColorListItem } from "@/utils/colors";

/** The minimal row state a caller has at right-click time ({id, title, pinned,
 *  favorite}); the composable fetches the rest (colorId, tagIds, notebookIds,
 *  published) for the submenu `checked` states. */
export interface NoteMenuRow {
  id: string;
  title: string;
  pinned: boolean;
  favorite: boolean;
}

export function useNoteContextMenu() {
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
  const auth = useAuthStore();

  /** Core's `DefaultColors` (name → hex) as title-cased preset entries for the
   *  Color submenu — picking one creates the color in the db + assigns it. */
  const presetColors = Object.entries(DefaultColors).map(([name, code]) => ({
    id: code,
    title: name.charAt(0).toUpperCase() + name.slice(1),
    colorCode: code
  }));

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
   *  differ / have none. A note has at most one color, so at most one colorId
   *  can cover the whole selection. */
  function commonColorId(rels: { fromId: string; toId: string }[], ids: string[]): string | null {
    const all = allHaveSet(rels, ids);
    for (const id of all) return id;
    return null;
  }

  /** Right-click a single note row → fetch its assignment snapshot (Color / Tags
   *  / Notebooks `checked` states + the published flag) and show the per-note
   *  context menu. On any fetch failure the menu still opens with empty checks.
   *  The submenu toggle callbacks mutate a mutable snapshot so a `keepOpen`
   *  toggle's ✓ flips live when the store rebuilds the submenu. */
  async function showNoteMenu(note: NoteMenuRow, e: MouseEvent): Promise<void> {
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
      tagIds = (tagItems as { id: string }[]).map((tg) => tg.id);
      notebookIds = (notebookItems as { id: string }[]).map((n) => n.id);
      published = db.monographs.isPublished(note.id);
    } catch {
      // leave the snapshot empty — the menu opens without checks
    }

    // The mutable snapshot the submenu builders close over. The keepOpen toggle
    // callbacks mutate it so the store's `refreshSubmenu` rebuild shows the new ✓.
    const target: NoteMenuTarget = { ...note, published, colorId, tagIds, notebookIds };

    const entries = buildNoteMenu(target, {
      // Hide the Publish/Unpublish section in local-only mode — publishing is a
      // server call gated on a logged-in account.
      canPublish: auth.isLoggedIn,
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
      tags: collections.tags.map((tg) => ({ id: tg.id, title: tg.title })),
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
          if (created && !target.tagIds.includes(created.id))
            target.tagIds = [...target.tagIds, created.id];
          void collections.load();
        });
      },
      notebooks: collections.notebooks.map((n) => ({ id: n.id, title: n.title })),
      addNotebook: (notebookId, noteId) => {
        if (!target.notebookIds.includes(notebookId))
          target.notebookIds = [...target.notebookIds, notebookId];
        void properties.addNotebook(notebookId, noteId);
      },
      removeNotebook: (notebookId, noteId) => {
        target.notebookIds = target.notebookIds.filter((x) => x !== notebookId);
        void properties.removeNotebook(notebookId, noteId);
      },
      createNotebook: (title, noteId) => {
        void properties.createNotebook(title, noteId).then((created) => {
          if (created && !target.notebookIds.includes(created.id))
            target.notebookIds = [...target.notebookIds, created.id];
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
      // right-clicked note that is not the active note). `target.published` is
      // set optimistically so the menu shows the published state if re-opened.
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

  /** Build + show the multi-selection context menu for `ids`: fetch the per-
   *  assignment "all selected notes have it" sets (one bulk
   *  `db.relations.to(...).get()` per type) + the shared color, then build the
   *  menu with callbacks that mutate the mutable `sel` snapshot so `keepOpen`
   *  submenu toggles flip their ✓ live. */
  async function showMultiNoteMenu(ids: string[], e: MouseEvent, ctxId?: string): Promise<void> {
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
      tags: collections.tags.map((tg) => ({ id: tg.id, title: tg.title })),
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

    const entries = buildMultiNoteMenu(sel, multiDeps);
    contextMenu.show(entries, e.clientX, e.clientY, ctxId);
  }

  return { showNoteMenu, showMultiNoteMenu };
}