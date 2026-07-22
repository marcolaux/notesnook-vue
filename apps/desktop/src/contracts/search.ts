/**
 * Pure search-result helpers for the global (title-bar) search. Import from
 * `@contracts/search` (renderer-local contracts — same folder as `titlebar.ts`
 * / `session-state.ts`). App-level pure helpers live here so both the renderer
 * and the contract tests (`tests/contract`) can resolve them via the `@`
 * alias without depending on the `@notesnook-vue/contracts` workspace package's
 * subpath exports.
 *
 * The vendored core's `db.lookup.notesWithHighlighting` returns
 * {@link HighlightedResult}s whose `title` / `content` fields are pre-split into
 * {@link Match} fragments (`prefix` / `match` / `suffix`) so the matched text is
 * already isolated — no re-scanning needed. These helpers render those
 * fragments into safe highlighted HTML / plain-text snippets for the search
 * dropdown + results tab.
 *
 * SECURITY: the `Match` fragments are TEXT extracted from note HTML (via
 * `htmlparser2` with `decodeEntities: true`), never trusted HTML. They may
 * contain literal `<` / `>` if the source note did. Render through
 * {@link matchesToHtml} (which escapes + wraps the match in `<mark>`) — NEVER
 * feed raw fragments to `v-html`.
 *
 * Dependency-free (core types only, re-exported via `@notesnook-vue/contracts`);
 * the `findMatches`-based doc-position selection lives in the renderer
 * (`utils/search-scroll.ts`) next to the TipTap/ProseMirror types.
 */
import type { HighlightedResult, Match } from "@notesnook-vue/contracts";

/** Escape `s` for safe interpolation into HTML text. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render a `Match[]` (a single title or one content block) as safe HTML with
 * the matched span wrapped in `<mark class="find-match">`. Each fragment is
 * escaped, so a note containing literal `<`/`>` characters can't inject markup.
 * Collapses whitespace to one line and caps length so a dropdown row stays tidy.
 */
export function matchesToHtml(matches: Match[]): string {
  let out = "";
  for (const m of matches) {
    out += escapeHtml(m.prefix) + `<mark class="find-match">${escapeHtml(m.match)}</mark>` + escapeHtml(m.suffix);
  }
  const collapsed = out.replace(/\s+/g, " ").trim();
  return collapsed.length > 200 ? collapsed.slice(0, 200) + "…" : collapsed;
}

/** Plain-text join of a `Match[]` (no highlighting) — for tooltips / fallback. */
export function matchesToText(matches: Match[]): string {
  return matches.map((m) => m.prefix + m.match + m.suffix).join("").replace(/\s+/g, " ").trim();
}

/**
 * Pick the best single-line snippet for a dropdown row: the first body content
 * block, falling back to the (highlighted) title when there are no content
 * matches. Returns highlighted HTML. Empty string when the result has neither
 * title nor content matches.
 */
export function snippetHtml(result: HighlightedResult): string {
  const firstContent = result.content.find((block) => block.length > 0);
  if (firstContent && firstContent.length > 0) return matchesToHtml(firstContent);
  if (result.title.length > 0) return matchesToHtml(result.title);
  return "";
}

export type { HighlightedResult, Match } from "@notesnook-vue/contracts";