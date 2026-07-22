/**
 * Tag-suggest extension (Phase 5.4). Wires `@tiptap/suggestion` to a Vue popup
 * (`TagMenu.vue` via `render.ts`) triggered by `#`. Mirrors `slash-commands.ts`
 * with two deliberate differences:
 *
 *  - `allowedPrefixes: null` — the slash menu leaves this at the default `[' ']`
 *    (trigger only after a space / at line start). The `#` picker must trigger
 *    ANYWHERE the user types `#` (per spec), and `allowedPrefixes: null`
 *    disables the prefix gate in `findSuggestionMatch` (the check is
 *    `if (allowedPrefixes !== null && !matchPrefixIsAllowed) return null`).
 *
 *  - `pluginKey: new PluginKey("tagSuggest")` — CRITICAL. `@tiptap/suggestion`
 *    defaults to a shared `SuggestionPluginKey`; a second Suggestion extension
 *    reusing it would collide with `slashCommands` on ProseMirror plugin state
 *    and silently break one or both. Each Suggestion extension needs its own
 *    key.
 *
 * The editor-vue layer has no access to the renderer's Pinia stores, so the
 * tag list + assign/create callbacks are injected by the host onto
 * `editor.storage` (`getTagSuggestions`, `assignTag`) via `wireTagMention` in
 * the renderer (twin of `wireAttachmentStorage`). Both hooks are optional;
 * if absent (e.g. an isolated test editor), `items` returns `[]` and
 * `command` no-ops gracefully.
 */
import { Extension } from "@tiptap/vue-3";
import type { Editor } from "@tiptap/vue-3";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";
import { tagMenuRenderer } from "./render";
import { findTagSuggestionMatch } from "./tag-suggest-match";
import type { TagSuggestionItem } from "./types";

export interface TagSuggestOptions {
  /** Maximum items shown in the popup before it scrolls. */
  maxItems?: number;
}

const tagSuggestPluginKey = new PluginKey("tagSuggest");

export const TagSuggest = Extension.create<TagSuggestOptions>({
  name: "tagSuggest",

  addOptions() {
    return { maxItems: 12 };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const maxItems = this.options.maxItems ?? 12;

    return [
      Suggestion<TagSuggestionItem, TagSuggestionItem>({
        // See the slash-commands extension for this core-vs-vue-3 Editor cast.
        editor: editor as unknown as Editor,
        pluginKey: tagSuggestPluginKey,
        char: "#",
        allowedPrefixes: null,
        allowSpaces: false,
        // Custom finder: require ≥1 non-space char after `#` so `# ` (hash +
        // space) does NOT open the picker — that's the markdown H1 input rule.
        // Only `#` + letter triggers the picker (see tag-suggest-match.ts).
        findSuggestionMatch: findTagSuggestionMatch,
        items: ({ query }) => {
          const fetch = (editor.storage as Record<string, unknown>).getTagSuggestions as
            | ((query: string) => TagSuggestionItem[])
            | undefined;
          return (fetch?.(query) ?? []).slice(0, maxItems);
        },
        command: ({ editor, range, props }) => {
          // Remove the `#query` text first.
          editor.chain().focus().deleteRange(range).run();
          const storage = editor.storage as Record<string, unknown>;
          const assign = storage.assignTag as
            | ((item: TagSuggestionItem) => Promise<{ id: string; title: string } | null>)
            | undefined;
          if (props.isNew) {
            // For a newly created tag the real id is minted by `db.tags.add`
            // in the host — await it before inserting the chip so the node
            // carries the correct `tagId` (persistence needs a real id).
            void Promise.resolve(assign?.(props)).then((resolved) => {
              if (!resolved || editor.isDestroyed) return;
              editor
                .chain()
                .focus()
                .insertContentAt(range.from, [
                  { type: "tagMention", attrs: { tagId: resolved.id, title: resolved.title } },
                  { type: "text", text: " " }
                ])
                .run();
            });
          } else {
            // Existing tag — id + title are already known; insert the chip
            // immediately and fire the assign (relation write) in the background.
            // The trailing space is an explicit text node (NOT a bare `" "`):
            // `insertContentAt` with a mixed array `[node, " "]` throws inside
            // `createNodeFromContent` (it routes the bare string through
            // `Node.fromJSON`) and the insert silently no-ops — the chip would
            // never appear even though `assignTag` still runs.
            editor
              .chain()
              .focus()
              .insertContentAt(range.from, [
                { type: "tagMention", attrs: { tagId: props.id, title: props.title } },
                { type: "text", text: " " }
              ])
              .run();
            void assign?.(props);
          }
        },
        render: () => tagMenuRenderer()
      })
    ];
  }
});