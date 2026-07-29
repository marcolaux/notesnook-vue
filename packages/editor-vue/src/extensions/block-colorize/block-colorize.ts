/**
 * Block-colorize extension — a faithful port of the `sn-super-colors` Standard
 * Notes theme, adapted to TipTap/ProseMirror. Colorizes block/inline elements
 * by type (headings, bold, italic, links, list items by nesting depth, code
 * syntax tokens) using the host theme's `--*-static` categorical palette.
 *
 * The visual rules live in the host's `style.css`, gated by a `block-colorize`
 * class on the editor's `.ProseMirror` DOM (toggled by the host bridge from the
 * per-note effective state — see `editor/block-colorize-bridge.ts`). This
 * extension owns the one piece CSS alone cannot do: stamping a `data-list-level`
 * attribute on every list item so the depth-cycle colour rules can select by
 * nesting level (the original SCSS hand-unrolled nested `ul`/`ol` selectors six
 * deep; an attribute is the clean ProseMirror equivalent).
 *
 * The plugin is gated by `editor.storage.blockColorize.enabled` (set by the
 * host bridge). When disabled it emits NO decorations, so the `data-list-level`
 * attributes vanish entirely (the colour rules are belt-and-suspenders gated by
 * the root class too). A no-op transaction carrying the
 * {@link blockColorizePluginKey} meta forces a recompute when the host flips
 * `enabled` without a doc change.
 */
import { Extension } from "@tiptap/vue-3";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export const blockColorizePluginKey = new PluginKey("blockColorize");

/** List *container* node names (the ancestors whose depth we count). Includes
 *  `checkList` (the simple/mobile checklist) so its items colorize by nesting
 *  depth like every other list type. */
const LIST_CONTAINERS = new Set([
  "bulletList",
  "orderedList",
  "taskList",
  "checkList",
  "outlineList"
]);

/** List *item* node names (the nodes that receive `data-list-level`). Includes
 *  `checkListItem` (the simple/mobile checklist item). */
const LIST_ITEMS = new Set(["listItem", "taskItem", "checkListItem", "outlineListItem"]);

/** Palette cycle length (matches the original: blue, red, yellow, green,
 *  orange — cyan reserved for links, so 5 not 6). */
const LEVEL_MOD = 5;

/** Count the list-container ancestors of the node at `pos` to derive its
 *  nesting depth (1-based). Walks the resolved position's ancestor stack. */
function listLevelAt(doc: ProseMirrorNode, pos: number): number {
  const $pos = doc.resolve(pos);
  let level = 0;
  for (let d = $pos.depth; d > 0; d--) {
    if (LIST_CONTAINERS.has($pos.node(d).type.name)) level++;
  }
  return level;
}

/** Build the `data-list-level` node decorations for every list item in `doc`.
 *  `level` is 1-based and cycles mod {@link LEVEL_MOD} (1..5). */
function buildListLevelDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (LIST_ITEMS.has(node.type.name)) {
      let level = listLevelAt(doc, pos);
      // The rich task-list AND the simple checklist nest VISUALLY via a
      // `data-indent` attribute (Tab adjusts `indent`, not real nested
      // containers — see `utils/list-indent.ts`). Without this, every item in
      // a flat list shares container-depth 1 and colourizes the same colour
      // regardless of how far it's indented. Add the visual indent so each
      // indentation level cycles to the next colour, matching how real nested
      // containers (bulletList) colourize by depth. Legacy simple-checklist
      // notes that still nest for real keep `indent: 0`, so this is a no-op
      // for them (their container depth already varies).
      if (node.type.name === "taskItem" || node.type.name === "checkListItem") {
        level += Number(node.attrs.indent ?? 0);
      }
      const slot = ((level - 1) % LEVEL_MOD) + 1;
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          "data-list-level": String(slot)
        })
      );
    }
    return true;
  });
  return DecorationSet.create(doc, decorations);
}

/** Shape of the storage the host bridge installs/mutates. The extension
 *  initializes the default; the bridge writes `enabled` and `toggle`. */
export interface BlockColorizeStorage {
  enabled: boolean;
  toggle?: () => void;
}

export const BlockColorize = Extension.create({
  name: "blockColorize",

  addStorage() {
    return {
      enabled: false
    } as BlockColorizeStorage;
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: blockColorizePluginKey,
        state: {
          init(_, { doc }) {
            // Decorations only when the host has enabled colorize.
            const enabled =
              (editor.storage.blockColorize as BlockColorizeStorage | undefined)
                ?.enabled ?? false;
            return enabled ? buildListLevelDecorations(doc) : DecorationSet.empty;
          },
          apply(tr, old) {
            const enabled =
              (editor.storage.blockColorize as BlockColorizeStorage | undefined)
                ?.enabled ?? false;
            if (!enabled) return DecorationSet.empty;
            // Recompute on any doc change, or when the host signals a pure
            // enable flip via the plugin meta (no doc steps).
            if (tr.docChanged || tr.getMeta(blockColorizePluginKey)) {
              return buildListLevelDecorations(tr.doc);
            }
            return (old as DecorationSet).map(tr.mapping, tr.doc);
          }
        },
        props: {
          decorations(state) {
            return blockColorizePluginKey.getState(state);
          }
        }
      })
    ];
  }
});