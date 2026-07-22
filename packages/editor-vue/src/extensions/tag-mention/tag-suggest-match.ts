/**
 * Custom `findSuggestionMatch` for the `#` tag picker (Phase 5.4). Identical in
 * spirit to `@tiptap/suggestion`'s default finder EXCEPT the trigger regex
 * requires **one-or-more** non-space chars after `#` (`#[^\s#]+`) instead of
 * the default zero-or-more (`#[^\s#]*`).
 *
 * Why: the default matches `#` with an EMPTY query when the user types `# `
 * (hash + space) — so the picker would open and collide with StarterKit's
 * markdown heading input rule (`# ` → H1). Requiring ≥1 char means:
 *   - `#` + space → NO picker → the `# ` heading input rule fires → H1.
 *   - `#` + letter → picker opens (query = the letters).
 *   - bare `#` (nothing after) → no picker until a letter is typed.
 *
 * This finder is tailored to the `TagSuggest` config (char `#`, `allowSpaces:
 * false`, `allowedPrefixes: null` → trigger anywhere, `startOfLine: false`),
 * so the prefix gate and the `allowSpaces` suffix handling from the default
 * are dropped (they'd be no-ops here).
 */
import { escapeForRegEx } from "@tiptap/core";
import type { Range } from "@tiptap/core";
import type { Trigger, SuggestionMatch } from "@tiptap/suggestion";

export function findTagSuggestionMatch(config: Trigger): SuggestionMatch {
  const { char, $position } = config;

  const escapedChar = escapeForRegEx(char);
  // `+` (not `*`) — require at least one non-space char after the trigger so
  // `# ` does not match (leaves it for the heading input rule).
  const regexp = new RegExp(`${escapedChar}[^\\s${escapedChar}]+`, "gm");

  const text = $position.nodeBefore?.isText && $position.nodeBefore.text;
  if (!text) return null;

  const textFrom = $position.pos - text.length;
  const match = Array.from(text.matchAll(regexp)).pop();
  if (!match || match.index === undefined) return null;

  const from = textFrom + match.index;
  const to = from + match[0].length;
  if (from < $position.pos && to >= $position.pos) {
    return {
      range: { from, to } as Range,
      query: match[0].slice(char.length),
      text: match[0]
    };
  }
  return null;
}