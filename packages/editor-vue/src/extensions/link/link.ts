/**
 * Link mark (note-linking) — a fresh port of upstream Notesnook's `link` mark
 * into editor-vue. Upstream persists note links as a standard TipTap `link`
 * MARK (not a custom node) on `<a href="nn://note/<id>[?blockId=<id>]">`, so a
 * note written here round-trips byte-for-byte with upstream. editor-vue has no
 * `@notesnook/editor` dependency (and `linkifyjs` isn't a dep), so this is a
 * minimal port: the schema + `setLink`/`toggleLink`/`unsetLink` commands + a
 * click-handler that delegates to a host-injected `editor.storage.openLink`.
 * Autolink / URL paste-rules are intentionally NOT ported (`nn://` is never
 * typed as prose; pasted `<a href="nn://…">` round-trips via `parseHTML`).
 *
 * The click handler mirrors upstream's `clickHandler`: on a main/middle click
 * (or Cmd/Ctrl-click) of an `<a>`, `preventDefault()` and call
 * `editor.storage.openLink?.(href, newTab)` (the host decides: `nn://` → open
 * the note in a tab; external → OS browser). When no `openLink` is injected
 * (e.g. an isolated test editor) the click falls through to the default.
 */
import { Mark, mergeAttributes } from "@tiptap/vue-3";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface LinkOptions {
  /** Extra HTML attributes merged onto every rendered `<a>`. */
  HTMLAttributes: Record<string, unknown>;
  /**
   * Open the link on click via the host's `editor.storage.openLink`. When
   * false (or no `openLink` injected), clicks fall through to the default.
   */
  openOnClick: boolean;
}

export interface LinkAttributes {
  href: string;
  target?: string | null;
  rel?: string | null;
  class?: string | null;
  title?: string | null;
  spellcheck?: string | null;
}

// NOTE: we deliberately do NOT add a `declare module "@tiptap/core"` augmentation
// for the `link` commands here. apps/desktop depends on `@notesnook/editor`, whose
// `link` mark already declares `setLink`/`toggleLink`/`unsetLink` on `Commands` —
// a second augmentation would collide (TS2717) even with an identical shape.
// The `addCommands` below provides the runtime commands; the ambient
// `@notesnook/editor` types supply `editor.commands.setLink` typing. Callers in
// editor-vue use the generic `setMark`/`extendMarkRange`/`unsetMark` (always
// typed) so they don't depend on either augmentation being in scope.

const clickLinkKey = new PluginKey("handleClickLink");

export const Link = Mark.create<LinkOptions>({
  name: "link",
  priority: 1000,
  inclusive: false,
  keepOnSplit: false,

  addOptions() {
    return {
      openOnClick: true,
      HTMLAttributes: {
        target: "_blank",
        rel: "noopener noreferrer nofollow",
        class: null,
        title: null
      }
    };
  },

  addAttributes() {
    return {
      spellcheck: { default: "false" },
      href: { default: null },
      target: { default: this.options.HTMLAttributes.target },
      rel: { default: this.options.HTMLAttributes.rel },
      class: { default: this.options.HTMLAttributes.class },
      title: { default: this.options.HTMLAttributes.title }
    };
  },

  parseHTML() {
    return [{ tag: "a" }];
  },

  renderHTML({ HTMLAttributes }) {
    // Strip `javascript:` hrefs (defensive — matches upstream) by blanking them.
    if (typeof HTMLAttributes.href === "string" && HTMLAttributes.href.startsWith("javascript:")) {
      return ["a", mergeAttributes(this.options.HTMLAttributes, { ...HTMLAttributes, href: "" }), 0];
    }
    return ["a", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setLink:
        (attributes) =>
        ({ chain }) =>
          attributes.href.length === 0
            ? chain().focus().extendMarkRange("link").unsetMark("link").run()
            : chain().focus().extendMarkRange("link").setMark("link", attributes).run(),

      toggleLink:
        (attributes) =>
        ({ chain, editor }) =>
          editor.isActive("link")
            ? chain().focus().extendMarkRange("link").unsetMark("link").run()
            : chain().focus().extendMarkRange("link").setMark("link", attributes).run(),

      unsetLink:
        () =>
        ({ chain }) =>
          chain().focus().extendMarkRange("link").unsetMark("link", { extendEmptyMarkRange: true }).run()
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    if (!this.options.openOnClick) return [];

    return [
      new Plugin({
        key: clickLinkKey,
        props: {
          handleDOMEvents: {
            click: (view, event) => {
              const mouseEvent = event as MouseEvent;
              const isMainClick = mouseEvent.button === 0;
              const isAuxClick = mouseEvent.button === 1;
              if (!isMainClick && !isAuxClick) return false;

              const target = event.target as HTMLElement | null;
              const anchor = target?.closest?.("a");
              if (!anchor) return false;

              // `getAttribute("href")` returns the raw attribute (e.g.
              // `nn://note/abc?blockId=blk-1`), unaffected by URL resolution.
              const href = anchor.getAttribute("href");
              if (!href) return false;

              const openLink = (editor.storage as Record<string, unknown>).openLink as
                | ((href: string, newTab: boolean) => void)
                | undefined;
              if (!openLink) return false;

              event.preventDefault();
              const newTab = isAuxClick || mouseEvent.ctrlKey || mouseEvent.metaKey;
              // Defer so the click doesn't disturb the editor's selection state.
              setTimeout(() => openLink(href, newTab));
              return true;
            }
          }
        }
      })
    ];
  }
});