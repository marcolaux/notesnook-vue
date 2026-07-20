/*
Pure in-document find/replace matcher (no editor dependency).

Given a ProseMirror document, `findMatches` returns every occurrence of a query
as a `{ from, to }` range in absolute doc coordinates. It is deliberately
ProseMirror-`Node`-only (no `Editor`, no `View`) so it is unit-testable in
isolation — the `FindReplace` extension (`./find-replace.ts`) calls this and
turns the ranges into `Decoration`s.

The tricky part is mapping a flat regex match back to doc positions: a doc is a
tree, and the editor renders text across separate text nodes (paragraphs,
headings, table cells, …). `buildTextMap` flattens the doc into one string plus
a parallel `posOf` array that gives, for each character index in that string,
its absolute doc position. A `"\n"` separator (pos = `-1`) is emitted between
two different text blocks so that a match which would cross a paragraph
boundary — i.e. whose range includes a `-1` — is rejected (find-within-paragraph
semantics, matching how every other editor's in-content find behaves). Position
mapping + boundary rejection are the only non-trivial logic; everything else
is a plain `RegExp.exec` loop.

Import `Node` as a TYPE only — `verbatimModuleSyntax` forbids value imports
that aren't used as values, and this module never instantiates `Node`.
*/
import type { Node } from "@tiptap/pm/model";

export interface SearchMatch {
  /** Inclusive start, absolute doc position. */
  from: number;
  /** Exclusive end, absolute doc position. */
  to: number;
}

export interface SearchOptions {
  caseSensitive?: boolean;
  /** Treat `query` as a raw `RegExp` source (escaped otherwise). */
  regexp?: boolean;
}

export interface TextMap {
  text: string;
  /** `posOf[i]` = absolute doc pos of `text[i]`, or `-1` for a block separator. */
  posOf: number[];
}

/**
 * Flatten `doc` into a single string with a parallel position map.
 *
 * Walks every text node; each character records its absolute doc position
 * (`pos + offsetWithinText`). A `"\n"` separator (pos `-1`) is inserted before
 * the first character of any text node whose immediate parent differs from the
 * previous text node's parent — i.e. on every text-block transition. Matches
 * that include such a separator character span a block boundary and are
 * rejected by {@link findMatches}.
 */
export function buildTextMap(doc: Node): TextMap {
  const chars: string[] = [];
  const posOf: number[] = [];
  let lastParent: Node | null = null;

  doc.nodesBetween(0, doc.content.size, (node, pos, parent) => {
    if (!node.isText) return true;
    const text = node.text ?? "";
    if (parent !== lastParent) {
      if (lastParent !== null) {
        chars.push("\n");
        posOf.push(-1);
      }
      lastParent = parent;
    }
    for (let i = 0; i < text.length; i++) {
      chars.push(text.charAt(i));
      posOf.push(pos + i);
    }
    return true;
  });

  return { text: chars.join(""), posOf };
}

/** Escape `s` for literal matching inside a `RegExp`. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRegex(query: string, opts: SearchOptions): RegExp | null {
  const flags = `g${opts.caseSensitive ? "" : "i"}`;
  if (opts.regexp) {
    try {
      return new RegExp(query, flags);
    } catch {
      // Invalid user-supplied pattern → no matches (mirrors the notes-list
      // search, which falls back rather than throwing).
      return null;
    }
  }
  return new RegExp(escapeRegExp(query), flags);
}

/**
 * Find every match of `query` in `doc`.
 *
 * Returns ranges in absolute doc coordinates; matches that would cross a
 * block boundary (a `-1` separator char) are skipped. Returns `[]` for an
 * empty query or an invalid regex.
 */
export function findMatches(doc: Node, query: string, opts: SearchOptions): SearchMatch[] {
  const results: SearchMatch[] = [];
  if (!query) return results;
  const re = buildRegex(query, opts);
  if (!re) return results;

  const { text, posOf } = buildTextMap(doc);
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  // Guard against runaway loops from pathological patterns (e.g. `a*` matching
  // the empty string at every position).
  let guard = 0;
  const max = text.length + 1;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === "") {
      // Zero-length match (e.g. `a*`): skip it and advance to avoid an
      // infinite loop. Find-and-replace doesn't surface empty matches.
      re.lastIndex++;
      continue;
    }
    const start = m.index;
    const end = start + m[0].length;
    // Reject if any character in the range is a block separator.
    let spansBoundary = false;
    for (let i = start; i < end; i++) {
      if (posOf[i]! < 0) {
        spansBoundary = true;
        break;
      }
    }
    if (!spansBoundary) {
      const from = posOf[start]!;
      const to = posOf[end - 1]! + 1;
      results.push({ from, to });
    }
    if (++guard > max) break;
  }
  return results;
}