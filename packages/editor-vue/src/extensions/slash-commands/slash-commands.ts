/**
 * Slash-commands TipTap extension (Phase 2.5). Wires `@tiptap/suggestion`
 * (char `/`) to the vendored slash items + the Vue render menu (`render.ts`).
 *
 * When the user types `/` (at the start of a line or after a space — the
 * Suggestion default `allowedPrefixes: [' ']` already covers both), the plugin
 * activates and reports the query (everything after `/`); we filter
 * {@link SLASH_ITEMS} by subsequence match and the render menu shows them.
 * Selecting an item (Enter / click) deletes the `/query` range and runs the
 * item's editor command.
 */
import { Extension } from "@tiptap/vue-3";
import type { Editor } from "@tiptap/vue-3";
import { Suggestion } from "@tiptap/suggestion";
import { SLASH_ITEMS, filterSlashItems, type SlashItem } from "../../tool-definitions";
import { slashMenuRenderer } from "./render";

export interface SlashCommandsOptions {
  /** Maximum items shown in the menu before it scrolls. */
  maxItems?: number;
}

export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: "slashCommands",

  addOptions() {
    return { maxItems: 12 };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const maxItems = this.options.maxItems ?? 12;

    return [
      Suggestion<SlashItem, SlashItem>({
        // `this.editor` is statically typed as core's base `Editor`, but the
        // Suggestion option (and the runtime instance) is `@tiptap/vue-3`'s
        // ExtendedEditor; cast to the truthful type. (Known TipTap core-vs-vue-3
        // Editor typing quirk under the single-core override.)
        editor: editor as unknown as Editor,
        char: "/",
        items: ({ query }) => filterSlashItems(SLASH_ITEMS, query).slice(0, maxItems),
        command: ({ editor, range, props }) => {
          // Remove the `/query` text, then run the selected item's editor command.
          editor.chain().focus().deleteRange(range).run();
          // `editor` here is typed as core's base `Editor` (Suggestion imports it
          // from @tiptap/core); `run` expects @tiptap/vue-3's Editor. The runtime
          // instance is the vue-3 editor, so cast at this boundary.
          props.run(editor as unknown as Editor);
        },
        render: () => slashMenuRenderer()
      })
    ];
  }
});