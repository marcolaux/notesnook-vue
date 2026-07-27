/**
 * Dynamic per-template command palette commands. For each template note, two
 * commands are registered so the user can pick a specific template on demand
 * (overriding the configured default):
 *   - `app:new-note-from:<id>` — "New note from <title>"
 *   - `app:new-task-from:<id>` — "New task from <title>" (navigates to /tasks)
 *
 * `syncTemplateCommands` is called by the templates store after every
 * `load()`: it unregisters the previously-registered template command ids,
 * then registers a fresh set from the current template list. This keeps the
 * palette current as templates are created, deleted, renamed, or re-titled.
 *
 * Why dynamic commands rather than a sub-picker: the omnibar reads
 * `getCommands()` and filters by query, so a command-per-template slots into
 * the existing palette with no new UI. The registry is a plain Map, so
 * unregister/re-register is cheap.
 */
import { registerCommand, unregisterCommand, type Command } from "./registry";
import i18n from "@/i18n";

const t = i18n.global.t.bind(i18n.global);

/** Tracks the command ids registered in the previous `syncTemplateCommands`
 *  call so they can be removed before re-registering. */
let registeredIds: string[] = [];

export function syncTemplateCommands(templates: { id: string; title: string }[]): void {
  for (const id of registeredIds) unregisterCommand(id);
  registeredIds = [];

  for (const tmpl of templates) {
    // Snapshot the interpolated title at registration (`command.newNoteFrom` /
    // `newTaskFrom` carry the user-data template title). Re-registered when
    // templates reload, so a rename/locale switch reflects on the next sync.
    // The omnibar resolver passes already-resolved titles through unchanged
    // (`te` is false for a resolved string).
    const title = tmpl.title || t("common.untitled");
    const noteFromId = `app:new-note-from:${tmpl.id}`;
    const taskFromId = `app:new-task-from:${tmpl.id}`;
    registerCommand({
      id: noteFromId,
      title: t("command.newNoteFrom", { title }),
      keywords: ["template", "new", "note", title.toLowerCase()],
      group: "app",
      run: (ctx) => {
        void ctx.notes.create({ templateId: tmpl.id });
      }
    });
    registerCommand({
      id: taskFromId,
      title: t("command.newTaskFrom", { title }),
      keywords: ["template", "new", "task", "todo", "checklist", title.toLowerCase()],
      group: "app",
      run: (ctx) => {
        ctx.router?.push("/tasks");
        void ctx.notes.create({ task: true, templateId: tmpl.id });
      }
    });
    registeredIds.push(noteFromId, taskFromId);
  }
}