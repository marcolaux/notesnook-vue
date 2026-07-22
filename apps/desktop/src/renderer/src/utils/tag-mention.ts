/**
 * Pure view-logic for the inline `#` tag picker (Phase 5.4). Framework-free so
 * it is unit-testable headlessly (see `tests/contract/tag-mention.spec.ts`)
 * and reused by the host bridge (`editor/tag-mention-bridge.ts`).
 *
 * Filtering reuses `filterByKey` from `@notesnook-vue/editor-vue` (subsequence
 * match, title-rank-first) — the same matcher the `/` slash menu uses — so the
 * `#` picker and slash menu feel consistent.
 */
import { filterByKey } from "@notesnook-vue/editor-vue";
import type { TagSuggestionItem } from "@notesnook-vue/editor-vue";

/** Minimal tag shape the picker needs (both `TagListItem` and `AssignedTag`
 *  satisfy it). */
export interface TagMentionCandidate {
  id: string;
  title: string;
}

/**
 * Build the `#`-popup item list for a query: existing tags (subsequence-matched,
 * title-rank-first, capped at `max`), followed by a synthetic "Create tag"
 * row when the trimmed query is non-empty and no existing tag exactly matches
 * the title (case-insensitive). An empty query returns up to `max` existing
 * tags and no create row.
 */
export function buildTagSuggestions(
  tags: readonly TagMentionCandidate[],
  query: string,
  max = 8
): TagSuggestionItem[] {
  const q = query.trim();
  const matched = filterByKey(tags, q, (t) => [t.title]).slice(0, max);
  const items: TagSuggestionItem[] = matched.map((t) => ({ id: t.id, title: t.title }));
  if (q) {
    const exact = tags.some((t) => t.title.toLowerCase() === q.toLowerCase());
    if (!exact) {
      items.push({ id: "__new__", title: q, isNew: true });
    }
  }
  return items;
}