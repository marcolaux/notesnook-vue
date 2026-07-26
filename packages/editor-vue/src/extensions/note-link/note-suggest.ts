/**
 * Note-suggest extension (note-linking). Wires `@tiptap/suggestion` to the
 * `NoteLinkPicker.vue` popup (via `render.ts`) triggered by BOTH `@` and `[[`
 * (the custom {@link findNoteSuggestionMatch} recognises either). Mirrors
 * `tag-mention/tag-suggest.ts` with the same two deliberate config choices:
 *
 *  - `allowedPrefixes: null` — trigger ANYWHERE the user types `@`/`[[`.
 *  - `pluginKey: new PluginKey("noteSuggest")` — a Suggestion extension needs
 *    its own key (the default shared `SuggestionPluginKey` would collide with
 *    `slashCommands` / `tagSuggest`).
 *
 * The editor-vue layer has no access to the renderer's Pinia stores / `db`, so
 * the note results + block drilldown are host-injected onto `editor.storage`
 * (`getNoteSuggestions`, `getContentBlocks`) via `wireNoteLink` in the
 * renderer. Both hooks are optional; if absent (an isolated test editor),
 * `items` returns `[]` and the popup shows "No notes found".
 *
 * On selection the command receives the final `{ href, title }` (a whole-note
 * or block link built by the picker via `createInternalLink`), deletes the
 * trigger+query range, and inserts the note's title as text carrying the `link`
 * mark + a trailing space (the shared `insertNoteLink` helper — selection-aware
 * but here the range was just deleted so the selection is empty).
 */
import { Extension } from "@tiptap/vue-3";
import type { Editor } from "@tiptap/vue-3";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";
import { noteLinkMenuRenderer } from "./render";
import { findNoteSuggestionMatch } from "./note-suggest-match";
import { insertNoteLink } from "../link/insert";
import type { NoteSuggestionItem, NoteLinkResult } from "./types";

export interface NoteSuggestOptions {
  /** Maximum note results shown before the popup scrolls. */
  maxItems?: number;
}

const noteSuggestPluginKey = new PluginKey("noteSuggest");

export const NoteSuggest = Extension.create<NoteSuggestOptions>({
  name: "noteSuggest",

  addOptions() {
    return { maxItems: 12 };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const maxItems = this.options.maxItems ?? 12;

    return [
      Suggestion<NoteSuggestionItem, NoteLinkResult>({
        // See the slash-commands extension for this core-vs-vue-3 Editor cast.
        editor: editor as unknown as Editor,
        pluginKey: noteSuggestPluginKey,
        // `char` is nominal — the real matching (both `@` and `[[`) is done by
        // the custom `findSuggestionMatch` below, which ignores `char`.
        char: "@",
        allowedPrefixes: null,
        allowSpaces: true,
        findSuggestionMatch: findNoteSuggestionMatch,
        items: ({ query }) => {
          const fetch = (editor.storage as Record<string, unknown>).getNoteSuggestions as
            | ((query: string) => NoteSuggestionItem[])
            | undefined;
          return (fetch?.(query) ?? []).slice(0, maxItems);
        },
        command: ({ editor, range, props }) => {
          // Remove the `@query` / `[[query` trigger text first, leaving an
          // empty selection at `range.from` for the insert. (Param types are
          // inferred from the `Suggestion<Item, Result>` generic — annotating
          // `editor` here would re-introduce the core-vs-vue-3 `Editor` clash.)
          editor.chain().focus().deleteRange(range).run();
          if (editor.isDestroyed) return;
          insertNoteLink(editor as unknown as Editor, props);
        },
        render: () => noteLinkMenuRenderer()
      })
    ];
  }
});