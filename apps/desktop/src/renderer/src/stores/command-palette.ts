/**
 * Command-palette store (Phase 2.5) — the headless core of the palette. Owns
 * open/query/activeIndex state and filters + executes registry commands. The
 * hotkey composable (`composables/use-command-palette`) toggles `open`; the
 * overlay component (a deferred visual follow-up) will render `items` and bind
 * its input to `setQuery` + keys to `next`/`prev`/`execute`.
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useEditorStore } from "@/stores/editor";
import { useNotesStore } from "@/stores/notes";
import { useAuthStore } from "@/stores/auth";
import { getCommands, getCommandRouter, type Command, type CommandContext } from "@/commands/registry";
import { filterCommands, cycleCommandIndex } from "@/commands/menu";

export const useCommandPaletteStore = defineStore("commandPalette", () => {
  const editorStore = useEditorStore();
  const notes = useNotesStore();
  const auth = useAuthStore();

  const open = ref(false);
  const query = ref("");
  const activeIndex = ref(0);

  const ctx = computed<CommandContext>(() => ({
    editor: editorStore.editor,
    notes,
    auth,
    router: getCommandRouter(),
    closePalette
  }));

  /** All commands whose `when` predicate currently passes. */
  const visibleCommands = computed<Command[]>(() => {
    const c = ctx.value;
    return getCommands().filter((cmd) => !cmd.when || cmd.when(c));
  });

  /** Visible commands filtered by the current query (title + keywords). */
  const items = computed<Command[]>(() => filterCommands(visibleCommands.value, query.value));

  function openPalette(): void {
    open.value = true;
    query.value = "";
    activeIndex.value = 0;
  }

  function closePalette(): void {
    open.value = false;
  }

  function setQuery(q: string): void {
    query.value = q;
    activeIndex.value = 0;
  }

  function next(): void {
    activeIndex.value = cycleCommandIndex(activeIndex.value, items.value.length, 1);
  }

  function prev(): void {
    activeIndex.value = cycleCommandIndex(activeIndex.value, items.value.length, -1);
  }

  function execute(): void {
    const command = items.value[activeIndex.value];
    if (command) {
      command.run(ctx.value);
    }
    closePalette();
  }

  return { open, query, activeIndex, items, visibleCommands, openPalette, closePalette, setQuery, next, prev, execute };
});