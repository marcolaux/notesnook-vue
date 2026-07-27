/**
 * Pure context-menu entry builders (headless) — turn a right-clicked item
 * (note / notebook / tag / shortcut) + a small bag of action callbacks into the
 * flat `MenuItem[]` the {@link useContextMenuStore} overlay renders. Kept
 * framework-agnostic (no Pinia, no db) so they are unit-tested in isolation
 * (see `tests/contract/context-menu-entries.spec.ts`); the components pass the
 * real store/bridge methods as the deps.
 *
 * Labels resolve through `i18n.global.t` (the menu is rebuilt on each right-
 * click, so labels localise + track the active locale without reactive wiring).
 * `checked` mirrors the item's current state so toggle entries show a leading
 * ✓; `danger` marks destructive entries.
 *
 * v2: the note-row menu carries Color / Tags / Notebooks submenus (one level
 * deep). The Tags + Notebooks submenus have a search field + a live "Create …"
 * entry; their toggle items use `keepOpen` so the user can flip several in one
 * open (the store rebuilds the submenu after each toggle so checkmarks update).
 *
 * The destructive entries (delete notebook/tag) compose `confirm` + the delete
 * callback so the component does not have to wire the confirm flow itself —
 * the builder returns a single `onSelect` that awaits the confirm dialog and
 * only deletes on `true`.
 */
import { separator, type MenuItem, type SubmenuSpec } from "@/utils/context-menu";
import i18n from "@/i18n";

const t = i18n.global.t.bind(i18n.global);

/** Options for the generic confirm dialog (see `useDialogStore`). */
export interface ConfirmOpts {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
export type ConfirmFn = (opts: ConfirmOpts) => Promise<boolean>;

/** A right-clicked note's relevant state (a subset of `NoteListItem`) + its
 *  assignment snapshot (used to seed the Color / Tags / Notebooks submenu
 *  `checked` states for the right-clicked note, which may differ from the
 *  active note — the view fetches this via `db.relations.to(note, …)` at
 *  menu-open time). */
export interface NoteMenuTarget {
  id: string;
  /** The note's title (used to seed a "Remind me…" reminder + the publish dialog). */
  title: string;
  pinned: boolean;
  favorite: boolean;
  /** Whether the note is published to the web (a monograph). Drives whether the
   *  Publish / Unpublish + Copy URL / Open entries show. */
  published: boolean;
  /** The note's current color id, or `null` when none. */
  colorId: string | null;
  /** Tag ids currently assigned to the note. */
  tagIds: string[];
  /** Notebook ids the note currently belongs to. */
  notebookIds: string[];
}

/** A colour / tag / notebook list entry for the submenus (the minimal shape the
 *  builders need — the view maps the store items down to this). */
export interface ColorMenuEntry {
  id: string;
  title: string;
  colorCode: string;
}
export interface AssignmentMenuEntry {
  id: string;
  title: string;
}

/** Actions the notes-list row needs (passed in from NotesList.vue). */
export interface NoteMenuDeps {
  openInWindow: (noteId: string) => void;
  openInSplit: (noteId: string, zone: "right" | "bottom") => void;
  togglePinned: (noteId: string) => void | Promise<void>;
  toggleFavorite: (noteId: string) => void | Promise<void>;
  /** Colour submenu: the available colors. */
  colors: ColorMenuEntry[];
  /** Assign / clear the note's color (single-select). */
  setColor: (colorId: string, noteId: string) => void | Promise<void>;
  clearColor: (noteId: string) => void | Promise<void>;
  /** Preset swatches shown in the Color submenu (from core's `DefaultColors`).
   *  Picking one creates the color in the db (if not already present) + assigns
   *  it to the note — one click, no dialog. */
  presetColors: ColorMenuEntry[];
  assignPresetColor: (title: string, colorCode: string, noteId: string) => void | Promise<void>;
  /** Open the "New color…" editor dialog (creates a custom color + assigns). */
  createColor: (noteId: string) => void | Promise<void>;
  /** Tags submenu: the available tags. */
  tags: AssignmentMenuEntry[];
  addTag: (tagId: string, noteId: string) => void | Promise<void>;
  removeTag: (tagId: string, noteId: string) => void | Promise<void>;
  createTag: (title: string, noteId: string) => void | Promise<void>;
  /** Notebooks submenu: the available notebooks. */
  notebooks: AssignmentMenuEntry[];
  addNotebook: (notebookId: string, noteId: string) => void | Promise<void>;
  removeNotebook: (notebookId: string, noteId: string) => void | Promise<void>;
  createNotebook: (title: string, noteId: string) => void | Promise<void>;
  /** Confirm-dialog hook (see `useDialogStore`) — used by the destructive
   *  "Move to trash" entry so the component does not wire the confirm flow. */
  confirm: ConfirmFn;
  /** Plain `void` (see {@link NotebookMenuDeps.deleteNotebook}); the builder
   *  still `await`s it. Moves the note to trash. */
  deleteNote: (id: string) => void;
  /** Archive the note (removes it from All Notes; reversible via Unarchive). */
  archiveNote: (id: string) => void;
  /** Open the "Remind me…" editor dialog seeded with the note's title +
   *  `nn://note/<id>` description, then create the reminder + link it to the
   *  note. The dialog flow + relation link live in NotesList.vue. */
  remindMe: (noteId: string, noteTitle: string) => void | Promise<void>;
  /** Publish-to-web (monographs) — open the publish dialog seeded with the
   *  note's title; on confirm, call `db.monographs.publish`. The dialog flow +
   *  publish-store call live in NotesList.vue. */
  publishNote: (noteId: string, noteTitle: string) => void | Promise<void>;
  /** Whether to show the Publish / Unpublish / Copy URL / Open-in-browser
   *  section at all. Omit (or pass `true`) to show; pass `false` to hide the
   *  whole section (used in local-only mode — publishing is a server call).
   *  Defaults to shown so existing fixtures/tests that omit it are unchanged. */
  canPublish?: boolean;
  /** Unpublish the note (plain `db.monographs.unpublish`) — the builder composes
   *  `confirm` around this (matching the "Move to trash" entry), so the dep does
   *  NOT need to wire the confirm flow itself. */
  unpublishNote: (noteId: string) => void | Promise<void>;
  /** Copy the note's monograph URL to the clipboard (the authoritative
   *  server-returned `Monograph.publishUrl`). */
  copyMonographUrl: (noteId: string) => void | Promise<void>;
  /** Open the note's monograph in the system browser (`window.open` →
   *  `shell.openExternal`). */
  openMonograph: (noteId: string) => void | Promise<void>;
}

/**
 * Build the Color submenu (one level, no search): a "No color" entry (checked
 * when the note has no color), a separator, then one swatch entry per existing
 * color (checked when it is the note's current color). Then a separator + the
 * preset swatches (core's `DefaultColors`, minus any already created) — picking
 * one creates the color + assigns it in one click. Finally a "New color…"
 * entry opens the editor dialog for a custom color. Selecting a color runs
 * `setColor`; "No color" runs `clearColor`. Closes the menu on pick (no
 * `keepOpen` — color is single-select).
 */
export function buildColorSubmenu(note: NoteMenuTarget, deps: NoteMenuDeps): SubmenuSpec {
  return {
    build: () => {
      const items: MenuItem[] = [
        {
          id: "no-color",
          label: t("contextMenu.noColor"),
          checked: note.colorId === null,
          onSelect: () => deps.clearColor(note.id)
        }
      ];
      if (deps.colors.length > 0) {
        items.push(
          separator("color-sep"),
          ...deps.colors.map((c) => ({
            id: c.id,
            label: c.title,
            color: c.colorCode,
            checked: note.colorId === c.id,
            onSelect: () => deps.setColor(c.id, note.id)
          }))
        );
      }
      // Presets that are not already in the user's color list (by colorCode).
      const existingCodes = new Set(deps.colors.map((c) => c.colorCode.toLowerCase()));
      const presets = deps.presetColors.filter((p) => !existingCodes.has(p.colorCode.toLowerCase()));
      if (presets.length > 0) {
        items.push(
          separator("preset-sep"),
          ...presets.map((p) => ({
            id: `preset-${p.colorCode}`,
            label: p.title,
            color: p.colorCode,
            checked: false,
            onSelect: () => deps.assignPresetColor(p.title, p.colorCode, note.id)
          }))
        );
      }
      items.push(
        separator("new-color-sep"),
        { id: "new-color", label: t("contextMenu.newColor"), onSelect: () => deps.createColor(note.id) }
      );
      return items;
    }
  };
}

/** Case-insensitive substring filter for the tag/notebook submenu lists. */
function matchesQuery(title: string, query: string): boolean {
  return title.toLowerCase().includes(query.toLowerCase());
}

/**
 * Build the Tags submenu (one level, with search). `build(query)` filters the
 * tag list by the query; each tag toggles its assignment (`keepOpen` so several
 * can be flipped in one open — the store rebuilds after each toggle so the ✓
 * updates live). A "Create …" entry appears when the query is non-empty and no
 * existing tag title matches it exactly (creates + assigns in one step).
 */
export function buildTagsSubmenu(note: NoteMenuTarget, deps: NoteMenuDeps): SubmenuSpec {
  return {
    search: { placeholder: t("contextMenu.searchTags") },
    build: (query) => {
      const q = query.trim();
      const items: MenuItem[] = deps.tags
        .filter((tg) => q === "" || matchesQuery(tg.title, q))
        .map((tg) => {
          const assigned = note.tagIds.includes(tg.id);
          return {
            id: tg.id,
            label: tg.title,
            checked: assigned,
            keepOpen: true,
            onSelect: () => (assigned ? deps.removeTag(tg.id, note.id) : deps.addTag(tg.id, note.id))
          };
        });
      // Offer to create a tag with the typed title only when it is non-empty and
      // not an exact match of an existing tag (case-insensitive).
      const exact = deps.tags.some((tg) => tg.title.toLowerCase() === q.toLowerCase());
      if (q !== "" && !exact) {
        items.push(
          separator("create-sep"),
          {
            id: "create-tag",
            label: t("contextMenu.createTag", { q }),
            onSelect: () => deps.createTag(q, note.id)
          }
        );
      }
      return items;
    }
  };
}

/**
 * Build the Notebooks submenu (one level, with search). Same shape as
 * {@link buildTagsSubmenu} but over notebooks — toggling a notebook
 * adds/removes the note's membership (`keepOpen`). A "Create …" entry appears
 * for a non-empty, non-matching query (creates the notebook + adds the note).
 */
export function buildNotebooksSubmenu(note: NoteMenuTarget, deps: NoteMenuDeps): SubmenuSpec {
  return {
    search: { placeholder: t("contextMenu.searchNotebooks") },
    build: (query) => {
      const q = query.trim();
      const items: MenuItem[] = deps.notebooks
        .filter((n) => q === "" || matchesQuery(n.title, q))
        .map((n) => {
          const member = note.notebookIds.includes(n.id);
          return {
            id: n.id,
            label: n.title,
            checked: member,
            keepOpen: true,
            onSelect: () => (member ? deps.removeNotebook(n.id, note.id) : deps.addNotebook(n.id, note.id))
          };
        });
      const exact = deps.notebooks.some((n) => n.title.toLowerCase() === q.toLowerCase());
      if (q !== "" && !exact) {
        items.push(
          separator("create-sep"),
          {
            id: "create-notebook",
            label: t("contextMenu.createNotebook", { q }),
            onSelect: () => deps.createNotebook(q, note.id)
          }
        );
      }
      return items;
    }
  };
}

/**
 * Build the notes-list context menu:
 *   Open in new window
 *   Open in split right
 *   Open in split down
 *   ──
 *   Pin to top        (✓ note.pinned)
 *   Favorite          (✓ note.favorite)
 *   Remind me…
 *   ──
 *   Publish note / Unpublish note        (depending on note.published)
 *   Copy monograph URL / Open in browser (only when published)
 *   ──
 *   Color           ▸ (submenu)
 *   Tags            ▸ (submenu, search)
 *   Notebooks       ▸ (submenu, search)
 *   ──
 *   Move to trash                        (danger; confirm)
 */
export function buildNoteMenu(note: NoteMenuTarget, deps: NoteMenuDeps): MenuItem[] {
  // Publish section — Publish (when not published) vs Unpublish + Copy URL +
  // Open (when published). Unpublish is confirm-gated here (matching the
  // "Move to trash" entry) so the dep stays a plain call.
  const publishItems: MenuItem[] = note.published
    ? [
        {
          id: "unpublish",
          label: t("contextMenu.unpublishNote"),
          icon: "trash-2",
          danger: true,
          onSelect: async () => {
            const ok = await deps.confirm({
              title: t("editorToolbar.unpublishConfirmTitle"),
              message: t("editorToolbar.unpublishConfirmMsg"),
              confirmLabel: t("editorToolbar.unpublishConfirmLabel"),
              danger: true
            });
            if (ok) await deps.unpublishNote(note.id);
          }
        },
        { id: "copy-url", label: t("contextMenu.copyMonographUrl"), icon: "link", onSelect: () => deps.copyMonographUrl(note.id) },
        { id: "open-monograph", label: t("contextMenu.openInBrowser"), icon: "external-link", onSelect: () => deps.openMonograph(note.id) }
      ]
    : [
        {
          id: "publish",
          label: t("command.publishNote"),
          icon: "globe",
          onSelect: () => deps.publishNote(note.id, note.title)
        }
      ];
  return [
    { id: "open-window", label: t("contextMenu.openInNewWindow"), onSelect: () => deps.openInWindow(note.id) },
    { id: "split-right", label: t("contextMenu.openInSplitRight"), onSelect: () => deps.openInSplit(note.id, "right") },
    { id: "split-down", label: t("contextMenu.openInSplitDown"), onSelect: () => deps.openInSplit(note.id, "bottom") },
    separator("sep-1"),
    {
      id: "toggle-pinned",
      label: note.pinned ? t("contextMenu.unpinFromTop") : t("contextMenu.pinToTop"),
      checked: note.pinned,
      onSelect: () => deps.togglePinned(note.id)
    },
    {
      id: "toggle-favorite",
      label: note.favorite ? t("contextMenu.removeFromShortcuts") : t("contextMenu.addToShortcuts"),
      checked: note.favorite,
      onSelect: () => deps.toggleFavorite(note.id)
    },
    { id: "remind-me", label: t("contextMenu.remindMe"), onSelect: () => deps.remindMe(note.id, note.title) },
    // The publish section (separator + items) drops out entirely in local-only
    // mode (`canPublish === false`); `sep-2` stays as the divider before
    // Color/Tags/Notebooks either way, so no doubled separator.
    ...(deps.canPublish === false ? [] : [separator("publish-sep"), ...publishItems]),
    separator("sep-2"),
    { id: "color", label: t("contextMenu.color"), submenu: buildColorSubmenu(note, deps) },
    { id: "tags", label: t("contextMenu.tags"), submenu: buildTagsSubmenu(note, deps) },
    { id: "notebooks", label: t("contextMenu.notebooks"), submenu: buildNotebooksSubmenu(note, deps) },
    separator("sep-3"),
    { id: "archive", label: t("contextMenu.archive"), onSelect: () => deps.archiveNote(note.id) },
    {
      id: "delete",
      label: t("archive.moveToTrash"),
      danger: true,
      onSelect: async () => {
        const ok = await deps.confirm({
          title: t("archive.moveToTrash"),
          message: t("contextMenu.moveToTrashSingle"),
          confirmLabel: t("archive.moveToTrash"),
          danger: true
        });
        if (ok) await deps.deleteNote(note.id);
      }
    }
  ];
}

// --- Multi-selection menu ------------------------------------------------
/**
 * The multi-selection state the multi-note menu needs (besides the id list):
 * per-assignment "all selected notes have it" sets (drives the toggle
 * direction in the Tags / Notebooks submenus) + the color shared by ALL
 * selected notes (or `null` when they differ / have none). The view computes
 * these up front from a single bulk `db.relations.to({type:"note",ids},
 * "tag"|"notebook"|"color").get()` per type at menu-open time.
 */
export interface MultiMenuSelection {
  ids: string[];
  /** Tag ids present on EVERY selected note. */
  tagAllHave: Set<string>;
  /** Notebook ids EVERY selected note belongs to. */
  notebookAllHave: Set<string>;
  /** The color id shared by ALL selected notes, or `null` (none / they differ). */
  colorId: string | null;
}

/** Actions the multi-selection context menu needs (every callback takes the
 *  full `ids` list, not a single noteId). Mirrors {@link NoteMenuDeps} but for
 *  bulk writes; the open-window / split entries are omitted (single-note only). */
export interface MultiNoteMenuDeps {
  confirm: ConfirmFn;
  /** Plain `void` (see {@link NotebookMenuDeps.deleteNotebook}); the builder
   *  still `await`s it. Moves the notes to trash. */
  deleteMany: (ids: string[]) => void;
  setPinned: (ids: string[], state: boolean) => void | Promise<void>;
  setFavorite: (ids: string[], state: boolean) => void | Promise<void>;
  /** Colour submenu: the available colors + presets. */
  colors: ColorMenuEntry[];
  presetColors: ColorMenuEntry[];
  setColorMany: (colorId: string, ids: string[]) => void | Promise<void>;
  clearColorMany: (ids: string[]) => void | Promise<void>;
  assignPresetColorMany: (title: string, colorCode: string, ids: string[]) => void | Promise<void>;
  createColorMany: (ids: string[]) => void | Promise<void>;
  /** Tags submenu: the available tags. */
  tags: AssignmentMenuEntry[];
  addTagToMany: (tagId: string, ids: string[]) => void | Promise<void>;
  removeTagToMany: (tagId: string, ids: string[]) => void | Promise<void>;
  createTagMany: (title: string, ids: string[]) => void | Promise<void>;
  /** Notebooks submenu: the available notebooks. */
  notebooks: AssignmentMenuEntry[];
  addToNotebookMany: (notebookId: string, ids: string[]) => void | Promise<void>;
  removeFromNotebookMany: (notebookId: string, ids: string[]) => void | Promise<void>;
  createNotebookMany: (title: string, ids: string[]) => void | Promise<void>;
  duplicateMany: (ids: string[]) => void | Promise<void>;
  /** Archive every selected note (reversible via Unarchive). */
  archiveMany: (ids: string[]) => void;
}

/** Build the multi-selection Color submenu. Same shape as the single-note one,
 *  but every pick applies to ALL selected notes (assign / clear). `checked`
 *  reflects the shared color (`sel.colorId`): "No color" is checked when the
 *  notes share no color, a swatch is checked when it is the shared color. Closes
 *  on pick (color is single-select). */
export function buildMultiColorSubmenu(sel: MultiMenuSelection, deps: MultiNoteMenuDeps): SubmenuSpec {
  return {
    build: () => {
      const items: MenuItem[] = [
        {
          id: "no-color",
          label: t("contextMenu.noColor"),
          checked: sel.colorId === null,
          onSelect: () => deps.clearColorMany(sel.ids)
        }
      ];
      if (deps.colors.length > 0) {
        items.push(
          separator("color-sep"),
          ...deps.colors.map((c) => ({
            id: c.id,
            label: c.title,
            color: c.colorCode,
            checked: sel.colorId === c.id,
            onSelect: () => deps.setColorMany(c.id, sel.ids)
          }))
        );
      }
      const existingCodes = new Set(deps.colors.map((c) => c.colorCode.toLowerCase()));
      const presets = deps.presetColors.filter((p) => !existingCodes.has(p.colorCode.toLowerCase()));
      if (presets.length > 0) {
        items.push(
          separator("preset-sep"),
          ...presets.map((p) => ({
            id: `preset-${p.colorCode}`,
            label: p.title,
            color: p.colorCode,
            checked: false,
            onSelect: () => deps.assignPresetColorMany(p.title, p.colorCode, sel.ids)
          }))
        );
      }
      items.push(
        separator("new-color-sep"),
        { id: "new-color", label: t("contextMenu.newColor"), onSelect: () => deps.createColorMany(sel.ids) }
      );
      return items;
    }
  };
}

/** Build the multi-selection Tags submenu. Each tag toggles across the whole
 *  selection: when EVERY selected note has the tag → "Remove from all"
 *  (`checked`); otherwise → "Add to all". `keepOpen` so several can be flipped
 *  in one open. A "Create …" entry creates a tag + adds it to all. */
export function buildMultiTagsSubmenu(sel: MultiMenuSelection, deps: MultiNoteMenuDeps): SubmenuSpec {
  return {
    search: { placeholder: t("contextMenu.searchTags") },
    build: (query) => {
      const q = query.trim();
      const items: MenuItem[] = deps.tags
        .filter((tg) => q === "" || matchesQuery(tg.title, q))
        .map((tg) => {
          const allHave = sel.tagAllHave.has(tg.id);
          return {
            id: tg.id,
            label: tg.title,
            checked: allHave,
            keepOpen: true,
            onSelect: () => (allHave ? deps.removeTagToMany(tg.id, sel.ids) : deps.addTagToMany(tg.id, sel.ids))
          };
        });
      const exact = deps.tags.some((tg) => tg.title.toLowerCase() === q.toLowerCase());
      if (q !== "" && !exact) {
        items.push(
          separator("create-sep"),
          {
            id: "create-tag",
            label: t("contextMenu.createTag", { q }),
            onSelect: () => deps.createTagMany(q, sel.ids)
          }
        );
      }
      return items;
    }
  };
}

/** Build the multi-selection Notebooks submenu. Each notebook toggles across
 *  the whole selection: when EVERY selected note is in it → "Remove from all"
 *  (`checked`); otherwise → "Add to all". `keepOpen`. A "Create …" entry creates
 *  a notebook + adds all selected notes to it. */
export function buildMultiNotebooksSubmenu(sel: MultiMenuSelection, deps: MultiNoteMenuDeps): SubmenuSpec {
  return {
    search: { placeholder: t("contextMenu.searchNotebooks") },
    build: (query) => {
      const q = query.trim();
      const items: MenuItem[] = deps.notebooks
        .filter((n) => q === "" || matchesQuery(n.title, q))
        .map((n) => {
          const allHave = sel.notebookAllHave.has(n.id);
          return {
            id: n.id,
            label: n.title,
            checked: allHave,
            keepOpen: true,
            onSelect: () =>
              allHave ? deps.removeFromNotebookMany(n.id, sel.ids) : deps.addToNotebookMany(n.id, sel.ids)
          };
        });
      const exact = deps.notebooks.some((n) => n.title.toLowerCase() === q.toLowerCase());
      if (q !== "" && !exact) {
        items.push(
          separator("create-sep"),
          {
            id: "create-notebook",
            label: t("contextMenu.createNotebook", { q }),
            onSelect: () => deps.createNotebookMany(q, sel.ids)
          }
        );
      }
      return items;
    }
  };
}

/**
 * Build the multi-selection notes-list context menu (shown when right-clicking
 * inside a multi-selection of size > 1):
 *   Pin to top / Unpin                  (apply to all — explicit, no tri-state)
 *   Favorite / Unfavorite
 *   ──
 *   Color           ▸ (submenu, applies to all)
 *   Tags            ▸ (submenu, search; toggle all-have-it)
 *   Notebooks       ▸ (submenu, search; toggle all-have-it)
 *   ──
 *   Duplicate
 *   Move to trash                       (danger; count-aware confirm)
 *
 * The single-note-only Open-in-window / split entries are omitted.
 */
export function buildMultiNoteMenu(sel: MultiMenuSelection, deps: MultiNoteMenuDeps): MenuItem[] {
  return [
    { id: "pin", label: t("contextMenu.pinToTop"), onSelect: () => deps.setPinned(sel.ids, true) },
    { id: "unpin", label: t("contextMenu.unpinFromTop"), onSelect: () => deps.setPinned(sel.ids, false) },
    { id: "favorite", label: t("contextMenu.addToShortcuts"), onSelect: () => deps.setFavorite(sel.ids, true) },
    { id: "unfavorite", label: t("contextMenu.removeFromShortcuts"), onSelect: () => deps.setFavorite(sel.ids, false) },
    separator("sep-1"),
    { id: "color", label: t("contextMenu.color"), submenu: buildMultiColorSubmenu(sel, deps) },
    { id: "tags", label: t("contextMenu.tags"), submenu: buildMultiTagsSubmenu(sel, deps) },
    { id: "notebooks", label: t("contextMenu.notebooks"), submenu: buildMultiNotebooksSubmenu(sel, deps) },
    separator("sep-2"),
    { id: "duplicate", label: t("contextMenu.duplicate"), onSelect: () => deps.duplicateMany(sel.ids) },
    { id: "archive", label: t("contextMenu.archive"), onSelect: () => deps.archiveMany(sel.ids) },
    {
      id: "delete",
      label: t("archive.moveToTrash"),
      danger: true,
      onSelect: async () => {
        const ok = await deps.confirm({
          title: t("archive.moveToTrash"),
          message: t("contextMenu.moveToTrashConfirm", sel.ids.length),
          confirmLabel: t("archive.moveToTrash"),
          danger: true
        });
        if (ok) await deps.deleteMany(sel.ids);
      }
    }
  ];
}

/** A right-clicked notebook's relevant state (a subset of `NotebookListItem`). */
export interface NotebookMenuTarget {
  id: string;
  title: string;
  pinned: boolean;
  /** The notebook's custom icon name (kebab Lucide), or `null` if none set. */
  icon?: string | null;
}

/** Actions the notebook row needs (passed in from NotebookNode.vue). */
export interface NotebookMenuDeps {
  createSubNotebook: (parentId: string) => void;
  toggleShortcut: (itemId: string) => void;
  isShortcut: (itemId: string) => boolean;
  togglePinnedToTop: (id: string) => void;
  rename: (id: string, currentTitle: string) => void;
  /** Open the icon picker (resolves the chosen icon name, or null on cancel). */
  setIcon: (id: string) => void;
  /** Clear the notebook's custom icon (revert to the default `book` glyph). */
  removeIcon: (id: string) => void;
  confirm: ConfirmFn;
  /** Plain `void` so a caller returning `Promise<boolean>` (the store wrappers)
   *  is assignable via the void-return rule; the builder still `await`s it. */
  deleteNotebook: (id: string) => void;
}

/**
 * Build the notebook context menu:
 *   New sub-notebook
 *   ──
 *   Add to shortcuts / Remove from shortcuts   (✓ isShortcut)
 *   Pinned to top / Unpin from top        (✓ notebook.pinned)
 *   ──
 *   Rename…
 *   Delete notebook                       (danger; confirm)
 */
export function buildNotebookMenu(
  notebook: NotebookMenuTarget,
  deps: NotebookMenuDeps
): MenuItem[] {
  const isPinned = deps.isShortcut(notebook.id);
  return [
    { id: "new-sub", label: t("contextMenu.newSubNotebook"), onSelect: () => deps.createSubNotebook(notebook.id) },
    separator("sep-1"),
    {
      id: "toggle-shortcut",
      label: isPinned ? t("contextMenu.removeFromShortcuts") : t("contextMenu.addToShortcuts"),
      checked: isPinned,
      onSelect: () => deps.toggleShortcut(notebook.id)
    },
    {
      id: "toggle-pinned-top",
      label: notebook.pinned ? t("contextMenu.unpinFromTop") : t("contextMenu.pinToTop"),
      checked: notebook.pinned,
      onSelect: () => deps.togglePinnedToTop(notebook.id)
    },
    separator("sep-2"),
    { id: "rename", label: t("contextMenu.rename"), onSelect: () => deps.rename(notebook.id, notebook.title) },
    { id: "set-icon", label: t("contextMenu.setIcon"), onSelect: () => deps.setIcon(notebook.id) },
    {
      id: "remove-icon",
      label: t("contextMenu.removeIcon"),
      disabled: !notebook.icon,
      onSelect: () => deps.removeIcon(notebook.id)
    },
    {
      id: "delete",
      label: t("contextMenu.deleteNotebook"),
      danger: true,
      onSelect: async () => {
        const ok = await deps.confirm({
          title: t("contextMenu.deleteNotebook"),
          message: t("contextMenu.deleteNotebookConfirm", { title: notebook.title }),
          confirmLabel: t("common.delete"),
          danger: true
        });
        if (ok) await deps.deleteNotebook(notebook.id);
      }
    }
  ];
}

/** A right-clicked tag's relevant state (a subset of `TagListItem`). */
export interface TagMenuTarget {
  id: string;
  title: string;
}

/** Actions the tag row needs (passed in from Sidebar.vue). */
export interface TagMenuDeps {
  toggleShortcut: (itemId: string) => void;
  isShortcut: (itemId: string) => boolean;
  rename: (id: string, currentTitle: string) => void;
  confirm: ConfirmFn;
  /** Plain `void` (see {@link NotebookMenuDeps.deleteNotebook}). */
  deleteTag: (id: string) => void;
}

/**
 * Build the tag context menu:
 *   Add to shortcuts / Remove from shortcuts   (✓ isShortcut)
 *   ──
 *   Rename…
 *   Delete tag                            (danger; confirm)
 */
export function buildTagMenu(tag: TagMenuTarget, deps: TagMenuDeps): MenuItem[] {
  const isPinned = deps.isShortcut(tag.id);
  return [
    {
      id: "toggle-shortcut",
      label: isPinned ? t("contextMenu.removeFromShortcuts") : t("contextMenu.addToShortcuts"),
      checked: isPinned,
      onSelect: () => deps.toggleShortcut(tag.id)
    },
    separator("sep-1"),
    { id: "rename", label: t("contextMenu.rename"), onSelect: () => deps.rename(tag.id, tag.title) },
    {
      id: "delete",
      label: t("contextMenu.deleteTag"),
      danger: true,
      onSelect: async () => {
        const ok = await deps.confirm({
          title: t("contextMenu.deleteTag"),
          message: t("contextMenu.deleteTagConfirm", { title: tag.title }),
          confirmLabel: t("common.delete"),
          danger: true
        });
        if (ok) await deps.deleteTag(tag.id);
      }
    }
  ];
}

/** A right-clicked sidebar color row's relevant state (a subset of
 *  `ColorListItem`). */
export interface ColorRowMenuTarget {
  id: string;
  title: string;
  colorCode: string;
}

/** Actions the color row needs (passed in from Sidebar.vue). `rename` just
 *  enters inline-rename mode for the row (the actual `db.colors.add` write
 *  happens on commit, mirroring the tag row's rename flow). `toggleShortcut`
 *  + `isShortcut` favorite/unfavorite the color (local-only — colors are NOT
 *  `db.shortcuts` items upstream, so "Pin to sidebar" toggles a local favorite
 *  that merges the color into the Shortcuts section; same entry shape as the
 *  tag/notebook menus for UI consistency). */
export interface ColorRowMenuDeps {
  rename: (id: string, currentTitle: string) => void;
  confirm: ConfirmFn;
  /** Plain `void` (see {@link NotebookMenuDeps.deleteNotebook}). */
  deleteColor: (id: string) => void;
  /** Toggle the color's local-only favorite (pin to / unpin from sidebar). */
  toggleShortcut: (itemId: string) => void;
  /** Is the color currently favorited? Drives the entry's label + check mark. */
  isShortcut: (itemId: string) => boolean;
}

/**
 * Build the sidebar color-row context menu:
 *   Add to shortcuts / Remove from shortcuts   (✓ favorited — local-only favorite)
 *   ──
 *   Rename…                              (enters inline-rename mode for the row
 *                                         — the title `<input>` replaces the
 *                                         label; Enter/blur commits via
 *                                         `colors.renameColor`, Esc cancels)
 *   ──
 *   Delete color                          (danger; confirm)
 *
 * Colors are not `db.shortcuts` items upstream, so "Pin to sidebar" toggles a
 * local-only favorite (merged into the Shortcuts section at the view layer)
 * rather than a real shortcut — but the entry mirrors the tag/notebook menus
 * for a consistent "favorite" UX.
 */
export function buildColorRowMenu(
  color: ColorRowMenuTarget,
  deps: ColorRowMenuDeps
): MenuItem[] {
  const isPinned = deps.isShortcut(color.id);
  return [
    {
      id: "toggle-shortcut",
      label: isPinned ? t("contextMenu.removeFromShortcuts") : t("contextMenu.addToShortcuts"),
      checked: isPinned,
      onSelect: () => deps.toggleShortcut(color.id)
    },
    separator("sep-1"),
    {
      id: "rename",
      label: t("contextMenu.rename"),
      onSelect: () => deps.rename(color.id, color.title)
    },
    separator("sep-2"),
    {
      id: "delete",
      label: t("contextMenu.deleteColor"),
      danger: true,
      onSelect: async () => {
        const ok = await deps.confirm({
          title: t("contextMenu.deleteColor"),
          message: t("contextMenu.deleteColorConfirm", { title: color.title }),
          confirmLabel: t("common.delete"),
          danger: true
        });
        if (ok) await deps.deleteColor(color.id);
      }
    }
  ];
}

/** A right-clicked shortcut's relevant state (a `ResolvedShortcut`, a
 *  favourite-note row, or a favorited-color row merged into the Shortcuts
 *  section at the view layer). `colorCode` is set only for color rows (the row
 *  renders a color swatch instead of a glyph icon). */
export interface ShortcutMenuTarget {
  id: string;
  type: "notebook" | "tag" | "note" | "color";
  title: string;
  /** Only for `"color"` rows — drives the swatch fill. */
  colorCode?: string;
}

/** Actions the shortcut row needs (passed in from Sidebar.vue). */
export interface ShortcutMenuDeps {
  open: (target: ShortcutMenuTarget) => void;
  removeShortcut: (itemId: string) => void;
}

/**
 * Build the shortcut context menu:
 *   Open
 *   ──
 *   Remove from shortcuts  (or "Remove from favourites" when `sc.type === "note"`
 *   — a favourite-note row isn't a `db.shortcuts` item; "removing" it unfavourites
 *   the note).
 */
export function buildShortcutMenu(
  sc: ShortcutMenuTarget,
  deps: ShortcutMenuDeps
): MenuItem[] {
  return [
    { id: "open", label: t("contextMenu.open"), onSelect: () => deps.open(sc) },
    separator("sep-1"),
    {
      id: "remove",
      label: t("contextMenu.removeFromShortcuts"),
      onSelect: () => deps.removeShortcut(sc.id)
    }
  ];
}

// --- sidebar section-header menu (manual-order reset) ----------------------
/**
 * Which sidebar section a header context menu resets the manual order for.
 * `"colors"` is synced (`db.settings.setSideBarOrder`); `"notebooks"` is the
 * local-only `localStorage` order.
 */
export type SidebarSectionKind = "notebooks" | "colors" | "shortcuts";

/** Actions the section-header context menu needs (passed in from Sidebar.vue). */
export interface SidebarSectionMenuDeps {
  /** True when a manual order is currently stored → "Reset manual order" is
   *  enabled; false → greyed (nothing to reset). */
  hasManualOrder: boolean;
  /** Clear the section's manual order (back to the column / title sort). */
  resetOrder: () => void;
}

/**
 * Build the sidebar **section-header** context menu (right-click the Notebooks
 * / Colors header). A single entry clears the section's manual sort so the user
 * can return to the default column (notebooks) / title (colors) sort after
 * drag-reordering:
 *   Reset manual order   (disabled when no manual order is stored)
 *
 * (Colors are synced via `db.settings`; notebooks are local-only. The caller
 * decides which reset path to invoke — this builder is section-agnostic.)
 */
export function buildSidebarSectionMenu(
  section: SidebarSectionKind,
  deps: SidebarSectionMenuDeps
): MenuItem[] {
  return [
    {
      id: "reset-order",
      label: t("contextMenu.resetManualOrder"),
      disabled: !deps.hasManualOrder,
      onSelect: () => deps.resetOrder()
    }
  ];
}