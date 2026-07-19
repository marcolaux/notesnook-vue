/**
 * Command registry (Phase 2.5) — the framework-agnostic action spine for the
 * command palette. App + editor commands register here at module load
 * (`./app-commands` + `./editor-commands`, pulled in by `./index` from
 * `main.ts`). The palette store reads `getCommands()`, filters by query (see
 * `./menu`) and visibility (`when`), and runs the selected command's `run`.
 *
 * Handlers receive a {@link CommandContext} carrying the editor instance +
 * the notes/auth stores + a `closePalette` callback. Store accessors are read
 * lazily at execute time (after Pinia is active), so registration order is safe.
 */
import type { Editor } from "@tiptap/vue-3";
import type { useNotesStore } from "@/stores/notes";
import type { useAuthStore } from "@/stores/auth";

export type CommandGroup = "app" | "editor";

export interface CommandContext {
  /** The active TipTap editor (undefined when no note is open). */
  editor: Editor | undefined;
  notes: ReturnType<typeof useNotesStore>;
  auth: ReturnType<typeof useAuthStore>;
  /** Close the palette overlay (called by the store after execute). */
  closePalette: () => void;
}

export interface Command {
  id: string;
  title: string;
  keywords?: string[];
  group: CommandGroup;
  /** Visibility predicate; omit (or return true) to show. */
  when?: (ctx: CommandContext) => boolean;
  run: (ctx: CommandContext) => void;
}

const commands = new Map<string, Command>();

/** Register a command (overwrites by id — safe under HMR / re-import). */
export function registerCommand(command: Command): void {
  commands.set(command.id, command);
}

export function registerCommands(list: readonly Command[]): void {
  for (const c of list) registerCommand(c);
}

export function getCommands(): Command[] {
  return [...commands.values()];
}

export function getCommand(id: string): Command | undefined {
  return commands.get(id);
}

/** Test-only: clear the registry (used by contract specs for isolation). */
export function clearCommands(): void {
  commands.clear();
}