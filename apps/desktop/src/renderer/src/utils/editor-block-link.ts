/**
 * Resolve the `blockId` of the block at the editor's current selection, so a
 * "Copy deep link to block" action can build an `nn://note/<id>?blockId=<id>`
 * URL that points at the exact block the caret is in.
 *
 * Block ids are NOT a ProseMirror concept at runtime: the editor's node specs
 * do not declare a `blockId` attribute, so the `data-block-id` attrs core
 * writes at save time are stripped when PM parses the stored HTML, and the live
 * rendered DOM carries none either. Core assigns them positionally in
 * `insertBlockIds` (`vendor/.../content-types/tiptap.ts`): a SINGLE global
 * counter, incremented for every block-level tag in the switch below in
 * document order, producing `${tagName}${counter}` ids (e.g. `p1`, `h12`,
 * `blockquote3`, `p4`, `ul5`, `p6`). `extract("blocks")` — which the
 * NoteLinkPicker lists — reads those same `data-block-id` values back in
 * document order, so `ContentBlock[i].id` == the `insertBlockIds` id.
 *
 * To stay in lockstep with that scheme WITHOUT a schema change (a round-trip
 * `blockId` attr would either break core's renumber-on-save invariant, if
 * rendered, or go stale after save, if parse-only), we re-walk the editor's
 * LIVE rendered DOM (`view.dom`) with the same tag switch + single global
 * counter and return the id of the block element that contains the caret. The
 * live DOM tags are exactly what core serializes from `getHTML()`, so the id
 * computed here equals what `insertBlockIds` will assign on the next save and
 * what the picker shows now (for content unedited since the last save).
 *
 * Pure + headless: `blockIdForElement` is unit-tested in isolation against a
 * hand-built DOM (see `tests/contract/editor-block-link.spec.ts`); the editor
 * glue (`blockIdAtSelection`) only touches `editor.view`.
 */
import type { Editor } from "@tiptap/vue-3";

/**
 * The block-level tags core's `insertBlockIds` counts — kept in sync with
 * `vendor/.../content-types/tiptap.ts`'s `ontag` switch. A single global
 * counter is shared across all of these (NOT per-tag), matching core.
 */
export const BLOCK_TAGS: ReadonlySet<string> = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "ul",
  "ol",
  "pre",
  "img",
  "iframe",
  "div"
]);

/**
 * Depth-first pre-order walk over `root`'s descendants, maintaining the single
 * global block counter core's `insertBlockIds` uses. Returns the
 * `${tagName}${counter}` id for the `target` element, or `null` if `target` is
 * never reached / is not one of the {@link BLOCK_TAGS}. `root` itself is not
 * counted (it is the editor surface, not a block).
 */
export function blockIdForElement(target: Element, root: Element): string | null {
  // `target` must itself be a counted block tag — core never ids anything else.
  if (!BLOCK_TAGS.has(target.tagName.toLowerCase())) return null;

  let index = 0;
  const stack: Element[] = [root];
  // Pre-order DFS that visits children in DOM order (reverse-push so the first
  // child is popped first). `root` is the walk root only; it is never matched.
  while (stack.length > 0) {
    const el = stack.pop()!;
    if (el !== root) {
      const tag = el.tagName.toLowerCase();
      if (BLOCK_TAGS.has(tag)) {
        index += 1;
        if (el === target) return `${tag}${index}`;
      }
    }
    // Push children in reverse so they are processed in document order.
    const children = el.children;
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]!);
    }
  }
  return null;
}

/**
 * The nearest counted block element enclosing `node`, climbing ancestors up to
 * (but not including) `root`; `null` if none. Picks the INNERMOST block —
 * matching `insertBlockIds`, which ids an inner `<p>` inside a `<blockquote>`
 * or `<ul><li>` separately from its container.
 */
function enclosingBlock(node: Node | null, root: Element): Element | null {
  let el: Element | null = node instanceof Element ? node : node?.parentElement ?? null;
  while (el && el !== root && !BLOCK_TAGS.has(el.tagName.toLowerCase())) {
    el = el.parentElement;
  }
  return el && el !== root ? el : null;
}

/**
 * Resolve the block id of the block at the editor's current selection (caret or
 * range — `selection.from` is used, so the block containing the start of the
 * selection wins). Returns `null` when the editor has no view, the DOM point
 * can't be resolved, or the caret is not inside a counted block (e.g. an empty
 * editor). Never throws.
 */
export function blockIdAtSelection(editor: Editor): string | null {
  const view = editor.view;
  const dom = view.dom;
  const from = editor.state.selection.from;
  let anchor: Node | null;
  try {
    anchor = view.domAtPos(from).node;
  } catch {
    return null;
  }
  const target = enclosingBlock(anchor, dom);
  if (!target) return null;
  return blockIdForElement(target, dom);
}