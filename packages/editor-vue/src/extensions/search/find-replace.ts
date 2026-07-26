/*
In-content Find & Replace TipTap extension.

Owns the match-highlight ProseMirror plugin + the command surface the
`FindBar.vue` component drives. The match math itself lives in the pure,
editor-free `./match.ts` (so it is unit-testable); this module wraps it in a
plugin that turns ranges into `Decoration`s and exposes `setFind` / `findNext`
/ `findPrev` / `replace` / `replaceAll` / `clearFind` commands.

Pattern mirrors `../code-block/highlighter.ts` (`@tiptap/pm/state` `Plugin` +
`PluginKey`, `@tiptap/pm/view` `Decoration`/`DecorationSet`). Import sources
use `@tiptap/vue-3` (re-exports `@tiptap/core`) so the editor and its
extensions share one ProseMirror schema — same rule as every other extension
in this package.
*/
import { Extension } from "@tiptap/vue-3";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node } from "@tiptap/pm/model";
import type { SearchMatch, SearchOptions } from "./match";
import { findMatches } from "./match";

export interface FindReplaceState {
  query: string;
  options: SearchOptions;
  matches: SearchMatch[];
  /** Index into `matches`, or `-1` when there are none. */
  currentIndex: number;
  decorations: DecorationSet;
}

const SET_META = "findReplace.set";
const INDEX_META = "findReplace.index";

/** Plugin key — exported so `FindBar.vue` can read live match state. */
export const findReplacePluginKey = new PluginKey<FindReplaceState>("findReplace");

/** Walk up from `el` to the first ancestor (inclusive) that scrolls
 *  vertically — i.e. has `overflow-y` of `auto` or `scroll` AND a bounded
 *  height (so it actually scrolls rather than growing with content). Returns
 *  `null` if none. */
export function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
  let node = el;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    const overflowY = style.overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** Scroll the editor's scroll container so doc position `pos` is centered. */
export function scrollPosIntoView(view: EditorView | undefined | null, pos: number): boolean {
  if (!view || view.isDestroyed || typeof document === "undefined") return false;
  const scroller = findScrollContainer(view.dom as HTMLElement);
  if (!scroller) return false;
  const doc = view.state.doc;
  const p = Math.max(0, Math.min(pos, doc.content.size - 1));
  const coords = view.coordsAtPos(p);
  const scrollerRect = scroller.getBoundingClientRect();
  const matchTop = coords.top - scrollerRect.top + scroller.scrollTop;
  const target = matchTop - scroller.clientHeight / 2;
  scroller.scrollTop = Math.max(0, target);
  return true;
}

function buildDecorations(
  doc: Node,
  matches: SearchMatch[],
  currentIndex: number
): DecorationSet {
  const decos = matches.map((m, i) =>
    Decoration.inline(m.from, m.to, {
      class: i === currentIndex ? "find-match find-match-current" : "find-match"
    })
  );
  return DecorationSet.empty.add(doc, decos);
}

function clampIndex(i: number, len: number): number {
  if (len <= 0) return -1;
  if (i < 0) return 0;
  if (i >= len) return len - 1;
  return i;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    findReplace: {
      /** Set the query + options; recomputes matches and resets to the first. */
      setFind: (query: string, options?: SearchOptions) => ReturnType;
      /** Advance to the next match (wraps). */
      findNext: () => ReturnType;
      /** Advance to the previous match (wraps). */
      findPrev: () => ReturnType;
      /** Replace the current match with `replacement`. */
      replace: (replacement: string) => ReturnType;
      /** Replace every match with `replacement`. */
      replaceAll: (replacement: string) => ReturnType;
      /** Clear the query + matches. */
      clearFind: () => ReturnType;
    };
  }
}

export const FindReplace = Extension.create({
  name: "findReplace",

  addProseMirrorPlugins() {
    const initialState: FindReplaceState = {
      query: "",
      options: {},
      matches: [],
      currentIndex: -1,
      decorations: DecorationSet.empty
    };

    return [
      new Plugin<FindReplaceState>({
        key: findReplacePluginKey,
        state: {
          init: () => initialState,
          apply: (tr, value): FindReplaceState => {
            const setMeta = tr.getMeta(SET_META) as
              | { query: string; options: SearchOptions }
              | undefined;
            if (setMeta) {
              const matches = setMeta.query
                ? findMatches(tr.doc, setMeta.query, setMeta.options)
                : [];
              const currentIndex = matches.length ? 0 : -1;
              return {
                query: setMeta.query,
                options: setMeta.options,
                matches,
                currentIndex,
                decorations: buildDecorations(tr.doc, matches, currentIndex)
              };
            }

            const indexMeta = tr.getMeta(INDEX_META) as number | undefined;
            if (indexMeta !== undefined) {
              const currentIndex = clampIndex(indexMeta, value.matches.length);
              return {
                ...value,
                currentIndex,
                decorations: buildDecorations(tr.doc, value.matches, currentIndex)
              };
            }

            if (tr.docChanged && value.query) {
              const matches = findMatches(tr.doc, value.query, value.options);
              const currentIndex = matches.length
                ? clampIndex(value.currentIndex, matches.length)
                : -1;
              return {
                ...value,
                matches,
                currentIndex,
                decorations: buildDecorations(tr.doc, matches, currentIndex)
              };
            }

            return value;
          }
        },
        props: {
          decorations: (state) =>
            findReplacePluginKey.getState(state)?.decorations ?? DecorationSet.empty
        }
      })
    ];
  },

  addCommands() {
    return {
      setFind:
        (query, options) =>
        ({ tr, dispatch, view }) => {
          const opts = options ?? {};
          tr.setMeta(SET_META, { query, options: opts });
          if (query) {
            const matches = findMatches(tr.doc, query, opts);
            if (matches.length > 0) {
              const m = matches[0]!;
              tr.setSelection(TextSelection.create(tr.doc, m.from, m.to));
              tr.scrollIntoView();
            }
          }
          if (dispatch) {
            dispatch(tr);
            if (query && view) {
              const matches = findMatches(view.state.doc, query, opts);
              if (matches.length > 0) {
                scrollPosIntoView(view, matches[0]!.from);
              }
            }
          }
          return true;
        },

      findNext:
        () =>
        ({ state, tr, dispatch, view }) => {
          const st = findReplacePluginKey.getState(state);
          if (!st || st.matches.length === 0) return false;

          let targetIndex = -1;
          const currentMatch = st.currentIndex >= 0 ? st.matches[st.currentIndex] : null;
          const currentSel = state.selection;

          if (
            currentMatch &&
            currentSel.from === currentMatch.from &&
            currentSel.to === currentMatch.to
          ) {
            targetIndex = (st.currentIndex + 1) % st.matches.length;
          } else {
            const idx = st.matches.findIndex((m) => m.from >= currentSel.from);
            targetIndex = idx >= 0 ? idx : 0;
          }

          const m = st.matches[targetIndex]!;
          tr.setMeta(INDEX_META, targetIndex);
          tr.setSelection(TextSelection.create(tr.doc, m.from, m.to));
          tr.scrollIntoView();
          if (dispatch) {
            dispatch(tr);
            if (view) scrollPosIntoView(view, m.from);
          }
          return true;
        },

      findPrev:
        () =>
        ({ state, tr, dispatch, view }) => {
          const st = findReplacePluginKey.getState(state);
          if (!st || st.matches.length === 0) return false;

          let targetIndex = -1;
          const currentMatch = st.currentIndex >= 0 ? st.matches[st.currentIndex] : null;
          const currentSel = state.selection;

          if (
            currentMatch &&
            currentSel.from === currentMatch.from &&
            currentSel.to === currentMatch.to
          ) {
            targetIndex = (st.currentIndex - 1 + st.matches.length) % st.matches.length;
          } else {
            let idx = -1;
            for (let i = st.matches.length - 1; i >= 0; i--) {
              if (st.matches[i]!.from < currentSel.from) {
                idx = i;
                break;
              }
            }
            targetIndex = idx >= 0 ? idx : st.matches.length - 1;
          }

          const m = st.matches[targetIndex]!;
          tr.setMeta(INDEX_META, targetIndex);
          tr.setSelection(TextSelection.create(tr.doc, m.from, m.to));
          tr.scrollIntoView();
          if (dispatch) {
            dispatch(tr);
            if (view) scrollPosIntoView(view, m.from);
          }
          return true;
        },

      replace:
        (replacement) =>
        ({ state, tr, dispatch, view }) => {
          const st = findReplacePluginKey.getState(state);
          if (!st || st.currentIndex < 0) return false;
          const m = st.matches[st.currentIndex];
          if (!m) return false;
          // Replacing the current match shifts every later match up by one, so
          // keeping `currentIndex` (clamped in `apply`) naturally lands on the
          // match that used to follow the replaced one → "find next" feel.
          tr.insertText(replacement, m.from, m.to);
          if (dispatch) {
            dispatch(tr);
            if (view) {
              const updatedSt = findReplacePluginKey.getState(view.state);
              if (
                updatedSt &&
                updatedSt.currentIndex >= 0 &&
                updatedSt.matches[updatedSt.currentIndex]
              ) {
                scrollPosIntoView(view, updatedSt.matches[updatedSt.currentIndex]!.from);
              }
            }
          }
          return true;
        },

      replaceAll:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const st = findReplacePluginKey.getState(state);
          if (!st || st.matches.length === 0) return false;
          // Replace from the end backward so earlier ranges stay valid.
          for (let i = st.matches.length - 1; i >= 0; i--) {
            const m = st.matches[i]!;
            tr.insertText(replacement, m.from, m.to);
          }
          if (dispatch) dispatch(tr);
          return true;
        },

      clearFind:
        () =>
        ({ tr, dispatch }) => {
          tr.setMeta(SET_META, { query: "", options: {} });
          if (dispatch) dispatch(tr);
          return true;
        }
    };
  }
});