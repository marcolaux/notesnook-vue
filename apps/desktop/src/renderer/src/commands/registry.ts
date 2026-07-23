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
import type { Router } from "vue-router";
import type { Editor } from "@tiptap/vue-3";
import type { useNotesStore } from "@/stores/notes";
import type { useAuthStore } from "@/stores/auth";
import type { useShellStore } from "@/stores/shell";
import type { useSyncStore } from "@/stores/sync";
import type { useUpdaterStore } from "@/stores/updater";
import type { useSpellCheckerStore } from "@/stores/spell-checker";
import type { useEditorLayoutStore } from "@/stores/editor-layout";
import type { useEditorStore } from "@/stores/editor";
import type { usePublishStore } from "@/stores/publish";

export type CommandGroup = "app" | "editor";

/**
 * The narrow slice of the omnibar store that command handlers may call. Kept
 * as a standalone interface (NOT `ReturnType<typeof useOmnibarStore>`) so the
 * registry doesn't import the store (the store imports the registry — that
 * would be a circular dep). The omnibar store satisfies this structurally.
 */
export interface OmnibarActions {
  /** Open the omnibar in note-search mode (clears the query, focuses the field). */
  openNotes(): void;
  /** Open the omnibar in command mode (prefills `>`, focuses the field). */
  openCommands(): void;
  /** Bump the focus signal (focus the field in whatever mode is active). */
  focus(): void;
}

export interface CommandContext {
  /** The focused pane's TipTap editor (undefined when no editor is live). */
  editor: Editor | undefined;
  notes: ReturnType<typeof useNotesStore>;
  auth: ReturnType<typeof useAuthStore>;
  /** Shell state (sidebar/list collapse + ToC/Properties panel visibility). */
  shell: ReturnType<typeof useShellStore>;
  /** Sync control (start/stop/cancel a sync — Phase 6.1). */
  sync: ReturnType<typeof useSyncStore>;
  /** Auto-updater control (check/download/install — Phase 6.2). */
  updater: ReturnType<typeof useUpdaterStore>;
  /** Spell-checker control (enable/languages/dictionary — Phase 6.6). */
  spellChecker: ReturnType<typeof useSpellCheckerStore>;
  /** Editor split/group/tab layout (Phase 4.2/4.3) — split/close-pane/tab nav. */
  layout: ReturnType<typeof useEditorLayoutStore>;
  /** Focused-editor registry — `requestFind()` opens the focused tab's find bar. */
  editorStore: ReturnType<typeof useEditorStore>;
  /** Publish-to-web state for the active note (publish/unpublish/URL) — Phase 5.1. */
  publish: ReturnType<typeof usePublishStore>;
  /** Title-bar omnibar — `openNotes()`/`openCommands()` switch the picker mode. */
  omnibar: OmnibarActions;
  /** The Vue Router instance (set from `main.ts`; undefined outside the app). */
  router: Router | undefined;
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

/** Remove a registered command (used by the dynamic template commands to
 *  re-sync the per-template set as templates are added/removed/renamed). */
export function unregisterCommand(id: string): void {
  commands.delete(id);
}

/**
 * Router accessor for command handlers. Set once from `main.ts` after the
 * router is installed; decouples handlers from `useRouter()` inject so they
 * work in the palette store (and are stub-able in tests).
 */
let commandRouter: Router | undefined;

export function setCommandRouter(router: Router): void {
  commandRouter = router;
}

export function getCommandRouter(): Router | undefined {
  return commandRouter;
}

/** Test-only: clear the registry (used by contract specs for isolation). */
export function clearCommands(): void {
  commands.clear();
}