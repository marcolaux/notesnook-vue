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

/** Tracks the command ids registered in the previous `syncTemplateCommands`
 *  call so they can be removed before re-registering. */
let registeredIds: string[] = [];

export function syncTemplateCommands(templates: { id: string; title: string }[]): void {
  for (const id of registeredIds) unregisterCommand(id);
  registeredIds = [];

  for (const t of templates) {
    const title = t.title || "Untitled";
    const noteFromId = `app:new-note-from:${t.id}`;
    const taskFromId = `app:new-task-from:${t.id}`;
    registerCommand({
      id: noteFromId,
      title: `New note from ${title}`,
      keywords: ["template", "new", "note", title.toLowerCase()],
      group: "app",
      run: (ctx) => {
        void ctx.notes.create({ templateId: t.id });
      }
    });
    registerCommand({
      id: taskFromId,
      title: `New task from ${title}`,
      keywords: ["template", "new", "task", "todo", "checklist", title.toLowerCase()],
      group: "app",
      run: (ctx) => {
        ctx.router?.push("/tasks");
        void ctx.notes.create({ task: true, templateId: t.id });
      }
    });
    registeredIds.push(noteFromId, taskFromId);
  }
}