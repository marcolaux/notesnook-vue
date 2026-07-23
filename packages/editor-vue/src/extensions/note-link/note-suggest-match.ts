/**
 * Custom `findSuggestionMatch` for the note-link picker. Handles BOTH inline
 * triggers — `@` (single-char) and `[[` (two-char wiki-link) — in ONE finder,
 * so a single {@link NoteSuggest} extension + `PluginKey` covers both (two
 * extensions would duplicate the popup/command plumbing and risk racing popups).
 *
 * The default `@tiptap/suggestion` finder only handles a single `char`, so this
 * finder ignores `config.char` and matches against a combined regex. The
 * returned `range` already encodes the trigger length, so `deleteRange(range)`
 * removes the right number of chars regardless of which trigger fired.
 *
 * Both branches match with ZERO or more chars after the trigger, so the picker
 * opens IMMEDIATELY on the bare `@` / `[[` (empty query → all notes), which is
 * the expected wiki-link/mention UX. (`#` tag-mention uses `+` to avoid the
 * `# ` → H1 input-rule collision, but `@` and `[[` have no such input rule, so
 * `*` is safe.) The match only stays active while the cursor sits at the trailing
 * edge of the trigger text, so a following space (`@ ` / `[[ `) deactivates it
 * and the picker closes — typed prose like an email `@example.com ` survives
 * (only `onExit` runs, which does not delete text).
 *
 *   - `@` / `[[` alone → match (empty query) → picker opens immediately.
 *   - `@foo` / `[[foo` → match (query = `foo`).
 *   - `@ ` / `[[ ` with the cursor past the space → no match → picker closes.
 *
 * The `@` branch excludes `@` and `[` from the query chars (so `@[`/`@@` don't
 * extend a match and a typed `[[` is owned by the `[[` branch, not the `@`
 * branch). The `[[` branch excludes `]` (a closing `]]` ends the trigger text,
 * which is fine — the picker still opens on the `[[query` portion).
 */
import type { Range } from "@tiptap/core";
import type { Trigger, SuggestionMatch } from "@tiptap/suggestion";

// `@[^\s@\[]*` : `@` then zero-or-more non-space, non-`@`, non-`[` chars.
// `\[\[[^\s\]]*` : `[[` then zero-or-more non-space, non-`]` chars.
const REGEXP = /(?:@[^\s@\[]*|\[\[[^\s\]]*)/gm;

export function findNoteSuggestionMatch(config: Trigger): SuggestionMatch {
  const { $position } = config;

  const text = $position.nodeBefore?.isText && $position.nodeBefore.text;
  if (!text) return null;

  const textFrom = $position.pos - text.length;
  const match = Array.from(text.matchAll(REGEXP)).pop();
  if (!match || match.index === undefined) return null;

  const matched = match[0];
  const triggerLen = matched.startsWith("[[") ? 2 : 1;
  const from = textFrom + match.index;
  const to = from + matched.length;
  if (from < $position.pos && to >= $position.pos) {
    return {
      range: { from, to } as Range,
      query: matched.slice(triggerLen),
      text: matched
    };
  }
  return null;
}