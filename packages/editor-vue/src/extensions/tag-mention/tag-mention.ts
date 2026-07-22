/*
Tag-mention node (Phase 5.4) — an inline, non-editable `#tag` chip that lives
inside the note body. Mirrors the attachment node's shape (`inline` + `atom`
+ `VueNodeViewRenderer`) but caches `tagId` + `title` so the chip renders
without resolving the id and survives save/reload.

Round-trip: `getHTML()` serialises the chip as `<span data-tag-id data-tag-title>`
and `setContent(html)` parses it back via the `span[data-tag-id]` rule. The
attributes use explicit dash-form `data-*` specs (NOT `getDataAttribute`) so the
serialised attribute names stay lower-case and match the parse selector — the
`getDataAttribute("tagId")` helper would emit `data-tagId` (lower-cased to
`data-tagid` by the DOM) and silently break the round-trip.

The chip caches `title`; renaming the tag in the sidebar does NOT rewrite
existing chips (the relation is the source of truth). A later resolve-on-load
pass can refresh titles from `tagId`.
*/
import { Node, mergeAttributes, VueNodeViewRenderer } from "@tiptap/vue-3";
import TagMentionView from "./TagMentionView.vue";
import type { TagMentionOptions, TagMentionAttributes, ReconcileOptions } from "./types";
import { RECONCILE_META, findOrphanTagMentionRanges } from "./reconcile";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tagMention: {
      /** Insert a `#tag` chip at the current selection. */
      insertTagMention: (attrs: TagMentionAttributes) => ReturnType;
      /**
       * Remove every `#tag` chip whose `tagId` is NOT in `assignedTagIds`
       * (orphan chips — their tag is no longer assigned to the note). No-op
       * (returns `false`, dispatches nothing) when there are none to strip,
       * so a no-op reconcile doesn't fire `onUpdate`/mark the note dirty. Sets
       * the {@link RECONCILE_META} transaction meta so the host's chip-deletion
       * handler skips the unassign side-effect for these strips.
       */
      reconcileTagMentions: (
        assignedTagIds: Iterable<string>,
        options?: ReconcileOptions
      ) => ReturnType;
    };
  }
}

export const TagMention = Node.create<TagMentionOptions>({
  name: "tagMention",
  content: "",
  marks: "",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  group() {
    return "inline";
  },

  addAttributes() {
    return {
      tagId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-tag-id"),
        renderHTML: (attrs: Record<string, unknown>) => {
          const value = attrs.tagId;
          return value != null ? { "data-tag-id": String(value) } : {};
        }
      },
      title: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-tag-title") ?? "",
        renderHTML: (attrs: Record<string, unknown>) => {
          const value = attrs.title;
          return value ? { "data-tag-title": String(value) } : {};
        }
      }
    };
  },

  parseHTML() {
    return [{ tag: "span[data-tag-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },

  addNodeView() {
    return VueNodeViewRenderer(TagMentionView);
  },

  addCommands() {
    return {
      insertTagMention:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent([{ type: this.name, attrs }]),
      reconcileTagMentions:
        (assignedTagIds, options) =>
        ({ tr, state, dispatch }) => {
          const ranges = findOrphanTagMentionRanges(
            state.doc,
            new Set(assignedTagIds)
          );
          if (ranges.length === 0) return false;
          // Delete in reverse document order so earlier positions stay valid.
          ranges.sort((a, b) => b.pos - a.pos);
          tr.setMeta(RECONCILE_META, true);
          tr.setMeta("addToHistory", false);
          if (options?.silent) tr.setMeta("preventUpdate", true);
          for (const r of ranges) tr.delete(r.pos, r.pos + r.size);
          dispatch?.(tr);
          return true;
        }
    };
  }
});