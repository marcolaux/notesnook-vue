/**
 * Templates store — note templates implemented as ordinary notes carrying the
 * reserved tag "template". A template is just a note whose body is copied into
 * a freshly created note/task; the default template for notes and tasks is
 * chosen in Settings (Notes section) and stored in the client-only config store
 * (`defaultNoteTemplate` / `defaultTaskTemplate` — note ids, or `null`).
 *
 * Data layer reuse (no new model):
 *  - The reserved tag is get-or-created via `db.tags.find`/`db.tags.add` (the
 *    latter THROWS on a duplicate title, so find-first and tolerate the race).
 *  - The template list is the set of notes related to that tag: tag→note
 *    relations are stored `from=tag, to=note`, so resolve with
 *    `db.relations.from({type:"tag",id},"note").resolve()` (see
 *    `notes.filterByCollection`).
 *  - A note is marked/unmarked as a template by adding/removing the relation
 *    (`db.relations.add`/`unlink({tag},{note})` — see `properties.addTag`).
 *  - A template's body is read via `db.content.findByNoteId(id).data` (the
 *    same HTML read path `notes.loadContent` uses).
 *
 * After every `load()`, the per-template palette commands are re-synced
 * (`syncTemplateCommands`) so "New note from <title>" / "New task from <title>"
 * stay current. The import is done lazily inside `load()` to avoid a circular
 * dependency (command modules → app-commands → registry, and templates store
 * is imported by app-commands).
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import { toListItem, type NoteListItem } from "@/stores/notes";
import { useNotesStore } from "@/stores/notes";
import type { Note } from "@notesnook-vue/contracts";
import { logger } from "@/utils/logger";

/** The reserved tag title that marks a note as a template. Case-sensitive
 *  (upstream `db.tags.find` uses `COLLATE BINARY`). */
export const TEMPLATE_TAG_TITLE = "template";

export const useTemplatesStore = defineStore("templates", () => {
  const templates = ref<NoteListItem[]>([]);
  /** The reserved tag's id, resolved on first `load()` and cached. */
  const templateTagId = ref<string | null>(null);

  const templateIds = computed(() => new Set(templates.value.map((t) => t.id)));

  /** Find the reserved "template" tag if it exists, returning its id (or
   *  `null` when the tag has not been created yet). Read-only — does NOT
   *  create the tag, so `load()` at boot never spawns an empty "template" tag
   *  in the sidebar before the user has made any templates. The tag is only
   *  created on demand by {@link ensureTemplateTag} (via createTemplate /
   *  toggleTemplate). */
  async function findTemplateTag(): Promise<string | null> {
    const db = getDatabase();
    const existing = await db.tags.find(TEMPLATE_TAG_TITLE);
    if (existing) {
      templateTagId.value = existing.id;
      return existing.id;
    }
    templateTagId.value = null;
    return null;
  }

  /** Get-or-create the reserved "template" tag and return its id. Idempotent.
   *  `db.tags.add` throws on a duplicate title, so find first; if a concurrent
   *  create wins the race, the add throws and we re-find. Only called from the
   *  paths that actually need to ATTACH the tag (createTemplate /
   *  toggleTemplate) — never from a plain `load()`. */
  async function ensureTemplateTag(): Promise<string> {
    const db = getDatabase();
    const existing = await db.tags.find(TEMPLATE_TAG_TITLE);
    if (existing) {
      templateTagId.value = existing.id;
      return existing.id;
    }
    try {
      const id = await db.tags.add({ title: TEMPLATE_TAG_TITLE });
      templateTagId.value = id;
      return id;
    } catch (e) {
      // Race: another caller created the tag between our find and add. Re-find.
      const again = await db.tags.find(TEMPLATE_TAG_TITLE);
      if (again) {
        templateTagId.value = again.id;
        return again.id;
      }
      // eslint-disable-next-line no-console
      logger.error("[templates] ensureTemplateTag failed:", e);
      throw e;
    }
  }

  /** Load the list of template notes (notes tagged "template"). Sorts by
   *  `dateEdited` desc. Re-syncs the per-template palette commands. Read-only:
   *  when the "template" tag doesn't exist yet (no templates made), the list
   *  is just empty — the tag is NOT created here, so the sidebar stays clean
   *  on first start. Safe to call repeatedly. */
  async function load(): Promise<void> {
    try {
      const tagId = await findTemplateTag();
      if (tagId) {
        const db = getDatabase();
        const notes = await db.relations
          .from({ type: "tag", id: tagId }, "note")
          .resolve();
        const list = (notes as Note[]).map(toListItem);
        list.sort((a, b) => b.dateEdited - a.dateEdited);
        templates.value = list;
      } else {
        templates.value = [];
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[templates] load failed:", e);
      templates.value = [];
    }
    // Lazily import to avoid a circular dep with the command modules.
    void import("@/commands/template-commands").then((m) =>
      m.syncTemplateCommands(templates.value)
    );
  }

  /** Whether `noteId` is currently a template. */
  function isTemplate(noteId: string): boolean {
    return templateIds.value.has(noteId);
  }

  /** Read a template note's HTML body. Returns `null` if the note/content is
   *  missing or vault-locked. */
  async function getTemplateHtml(templateId: string): Promise<string | null> {
    try {
      const db = getDatabase();
      const item = await db.content.findByNoteId(templateId);
      if (!item || ("locked" in item && item.locked)) return null;
      return typeof item.data === "string" ? item.data : "";
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[templates] getTemplateHtml failed:", e);
      return null;
    }
  }

  /** Create a new blank note pre-tagged "template" and open it for editing.
   *  Passes `content: ""` to `notes.create` so the default note template does
   *  NOT auto-apply (a template's body starts empty by design). Returns the new
   *  note id, or `null` on failure. */
  async function createTemplate(): Promise<string | null> {
    try {
      const tagId = await ensureTemplateTag();
      const notes = useNotesStore();
      const id = await notes.create({ content: "" });
      const db = getDatabase();
      await db.relations.add(
        { id: tagId, type: "tag" },
        { id, type: "note" }
      );
      await notes.load();
      await load();
      return id;
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[templates] createTemplate failed:", e);
      return null;
    }
  }

  /** Toggle the "template" tag on `noteId`. Returns `true` if it is now a
   *  template, `false` if it was removed (or on failure). Reloads the notes
   *  list + the templates list so both stay consistent. */
  async function toggleTemplate(noteId: string): Promise<boolean> {
    try {
      const tagId = await ensureTemplateTag();
      const db = getDatabase();
      const making = !isTemplate(noteId);
      if (making) {
        await db.relations.add(
          { id: tagId, type: "tag" },
          { id: noteId, type: "note" }
        );
      } else {
        await db.relations.unlink(
          { id: tagId, type: "tag" },
          { id: noteId, type: "note" }
        );
      }
      const notes = useNotesStore();
      await notes.load();
      await load();
      return making;
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[templates] toggleTemplate failed:", e);
      return isTemplate(noteId);
    }
  }

  return {
    templates,
    templateTagId,
    ensureTemplateTag,
    load,
    isTemplate,
    getTemplateHtml,
    createTemplate,
    toggleTemplate
  };
});