/**
 * Builds the {@link AssignmentSubmenuDeps} for the "Add to notebook / tag /
 * Assign color" command-palette commands — the assignment slice of the
 * notes-list context-menu deps, wired to the Pinia stores. The three submenu
 * builders (`buildColorSubmenu` / `buildTagsSubmenu` / `buildNotebooksSubmenu`
 * in `utils/context-menu-entries.ts`) are reused verbatim, so search / create /
 * multi-toggle / preset behaviour is identical to the right-click menus.
 *
 * Kept here (not in the pure `context-menu-entries.ts`) because it pulls in the
 * Pinia stores; the pure builders stay framework-agnostic + unit-testable.
 *
 * The `target` snapshot is mutated in place by the toggle callbacks (mirroring
 * `NotesList.vue`'s wiring) so `refreshSubmenu` rebuilds show the new ✓ on a
 * `keepOpen` toggle without waiting for a db round-trip. Create / preset
 * entries have no `keepOpen` → the menu closes after them (so a freshly created
 * tag/notebook shows up on the next open, once `collections.load()` has run).
 */
import { DefaultColors } from "@notesnook-vue/contracts";
import { usePropertiesStore } from "@/stores/properties";
import { useCollectionsStore } from "@/stores/collections";
import { useColorsStore } from "@/stores/colors";
import { useColorDialogStore } from "@/stores/color-dialog";
import { toColorListItem } from "@/utils/colors";
import type { AssignmentSubmenuDeps, NoteMenuTarget } from "@/utils/context-menu-entries";

/** Core's `DefaultColors` (name → hex) as title-cased preset entries for the
 *  Color submenu — picking one creates the color in the db + assigns it. */
const presetColors = Object.entries(DefaultColors).map(([name, code]) => ({
  id: code,
  title: name.charAt(0).toUpperCase() + name.slice(1),
  colorCode: code
}));

export function buildActiveNoteAssignmentDeps(target: NoteMenuTarget): AssignmentSubmenuDeps {
  const properties = usePropertiesStore();
  const collections = useCollectionsStore();
  const colors = useColorsStore();
  const colorDialog = useColorDialogStore();

  return {
    colors: colors.items.map(toColorListItem),
    setColor: (colorId, noteId) => {
      target.colorId = colorId;
      void properties.setColor(colorId, noteId);
    },
    clearColor: (noteId) => {
      target.colorId = null;
      void properties.clearColor(noteId);
    },
    presetColors,
    assignPresetColor: (title, colorCode, noteId) => {
      void colors.add({ title, colorCode }).then((id) => {
        if (id) {
          target.colorId = id;
          void properties.setColor(id, noteId);
        }
      });
    },
    createColor: (noteId) => {
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
    }
  };
}