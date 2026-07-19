/**
 * Pure query-filter helpers shared by the slash-command menu (editor-vue) and
 * the renderer's command-palette store. Framework-agnostic, no Vue/Pinia.
 *
 * Matching is a case-insensitive **subsequence** match (characters of the query
 * appear in order in the key) — forgiving for "hd" → "Heading", "blkqte" →
 * "Blockquote". Empty query returns every item. Items whose first key (the
 * title) matches rank ahead of items that only match a later key (keywords),
 * preserving original order within each tier.
 */

export function subsequenceMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let i = 0;
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) i++;
  }
  return i === q.length;
}

/**
 * Filter `items` by a subsequence match against the keys returned by `getKeys`.
 * `getKeys(item)[0]` is treated as the title (title-matches rank first); the
 * remaining keys are keywords. Empty `query` returns all items unchanged.
 */
export function filterByKey<T>(
  items: readonly T[],
  query: string,
  getKeys: (item: T) => string[]
): T[] {
  if (!query) return [...items];
  const titleMatches: T[] = [];
  const keywordMatches: T[] = [];
  for (const item of items) {
    const keys = getKeys(item);
    const title = keys[0] ?? "";
    if (subsequenceMatch(query, title)) {
      titleMatches.push(item);
    } else if (keys.slice(1).some((k) => subsequenceMatch(query, k))) {
      keywordMatches.push(item);
    }
  }
  return [...titleMatches, ...keywordMatches];
}

/** Wrapping index navigation (used by palette/slash keyboard nav). */
export function cycleIndex(
  current: number,
  length: number,
  delta: number
): number {
  if (length <= 0) return 0;
  return ((current % length) + (delta % length) + length) % length;
}