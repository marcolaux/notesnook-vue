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
import { Decoration, DecorationSet } from "@tiptap/pm/view";
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
        ({ tr, dispatch }) => {
          tr.setMeta(SET_META, { query, options: options ?? {} });
          if (dispatch) dispatch(tr);
          return true;
        },

      findNext:
        () =>
        ({ state, tr, dispatch }) => {
          const st = findReplacePluginKey.getState(state);
          if (!st || st.matches.length === 0) return false;
          const next = (st.currentIndex + 1) % st.matches.length;
          const m = st.matches[next]!;
          tr.setMeta(INDEX_META, next);
          tr.setSelection(TextSelection.create(tr.doc, m.from, m.to));
          tr.scrollIntoView();
          if (dispatch) dispatch(tr);
          return true;
        },

      findPrev:
        () =>
        ({ state, tr, dispatch }) => {
          const st = findReplacePluginKey.getState(state);
          if (!st || st.matches.length === 0) return false;
          const prev =
            (st.currentIndex - 1 + st.matches.length) % st.matches.length;
          const m = st.matches[prev]!;
          tr.setMeta(INDEX_META, prev);
          tr.setSelection(TextSelection.create(tr.doc, m.from, m.to));
          tr.scrollIntoView();
          if (dispatch) dispatch(tr);
          return true;
        },

      replace:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const st = findReplacePluginKey.getState(state);
          if (!st || st.currentIndex < 0) return false;
          const m = st.matches[st.currentIndex];
          if (!m) return false;
          // Replacing the current match shifts every later match up by one, so
          // keeping `currentIndex` (clamped in `apply`) naturally lands on the
          // match that used to follow the replaced one → "find next" feel.
          tr.insertText(replacement, m.from, m.to);
          if (dispatch) dispatch(tr);
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