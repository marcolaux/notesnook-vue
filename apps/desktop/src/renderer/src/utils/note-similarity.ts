/**
 * Proactive note-suggestion engine (headless, framework-light).
 *
 * Given the current note's text, finds the most similar existing notes and
 * aggregates the notebooks / tags / colors assigned to them, weighted by
 * similarity. The result feeds the per-pane suggestion overlay
 * (`use-note-suggestions` + `NoteSuggestions.vue`) that offers one-click
 * assignment when a note has content but no organization yet.
 *
 * Two backends, mirroring the omnibar's tiered search:
 *   • Semantic (vector KNN) when `semanticSearchEnabled` is on — embeds the
 *     note text via the worker (`computeEmbedding`) and KNN-searches `vec_notes`
 *     (`searchVectorEmbeddingsByVector`). Weighted by cosine similarity.
 *   • Lexical (FTS5) fallback otherwise — tokenizes the text into distinctive
 *     terms, runs an `OR` query through `db.lookup.notesWithHighlighting`, and
 *     weights by decayed rank (`1/(rank+1)`). Matches keywords, not meaning —
 *     noisier, but works without the vector index.
 *
 * Reuses the omnibar's exact path (`db.lookup.notesWithHighlighting`) and the
 * `useNoteFooter` relations-read pattern for assignments. The current note is
 * always excluded; results are filtered to live (non-trashed/archived) note ids
 * when `liveNoteIds` is provided (the composable passes `useNotesStore().items`).
 *
 * Confidence gating: a candidate notebook/tag/color must appear in ≥
 * `MIN_SUPPORT_COUNT` of the similar notes AND carry weighted support ≥
 * `SUPPORT_RATIO_OF_TOP` × the strongest candidate in its category. Weak
 * signal (the strongest candidate appears in only one note) → empty → no overlay.
 */

import type { Color, Notebook, Tag } from "@notesnook-vue/contracts";
import { getDatabase, getCurrentContext } from "@/platform/bootstrap";
import { readSemanticSearchEnabled } from "@/stores/settings";
import {
  computeEmbedding,
  searchVectorEmbeddingsByVector
} from "@/utils/vector-search";
import { logger } from "./logger";

// --- Tuneable constants ------------------------------------------------------

/** Top-K similar notes the aggregation runs over. */
export const SIMILAR_K = 24;
/** Minimum plaintext word count before suggestions are even considered. */
export const MIN_CONTENT_WORDS = 30;
/** Re-run the engine only after the word count grew by this much since the
 *  last run (avoids re-embedding on every keystroke while still letting the
 *  suggestions track the content as it grows — roughly one short sentence). */
export const RE_RUN_DELTA_WORDS = 5;
/** After dismissal, re-evaluate only once ~this many more words are added. */
export const REAPPEAR_DELTA_WORDS = 40;
/** Debounce after a typing pause before running the engine. */
export const DEBOUNCE_MS = 900;
/** Max suggestions surfaced per category. */
export const CAP_NOTEBOOKS = 3;
export const CAP_TAGS = 5;
export const CAP_COLORS = 3;
/** Max similar notes surfaced as "related notes" (open/link actions). */
export const CAP_NOTES = 5;
/** Confidence gate: a candidate passes iff it appears in ≥ `MIN_SUPPORT_COUNT`
 *  of the similar notes AND its weighted support is ≥ `SUPPORT_RATIO_OF_TOP`
 *  times the STRONGEST candidate in its category (relative-to-top, not
 *  relative-to-total). Relative-to-total was far too strict with a large similar
 *  set (a tag needed to dominate ~30% of ALL similar notes' total weight);
 *  relative-to-top surfaces the strongest cluster of shared assignments and
 *  adapts to whatever the similar-note set looks like. */
export const SUPPORT_RATIO_OF_TOP = 0.5;
/** …and it must appear in at least this many of the similar notes (absolute
 *  floor; if the strongest candidate appears in only one note, nothing is
 *  surfaced — weak signal → no overlay). */
export const MIN_SUPPORT_COUNT = 2;
/** Lexical fallback: max distinctive terms in the OR query. */
const LEXICAL_MAX_TERMS = 15;
/** Lexical fallback: minimum token length (drops "a", "to", "the", …). */
const LEXICAL_MIN_TOKEN = 3;

// A small English stopword set — kept tiny and inline (the lexical path is a
// fallback; the semantic path doesn't need it). Enough to shed the commonest
// glue words that would otherwise dominate a short note's term frequency.
const STOPWORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "have", "you", "are",
  "not", "but", "will", "was", "were", "they", "your", "their", "what", "when",
  "which", "how", "why", "who", "can", "all", "any", "some", "into", "about",
  "than", "then", "them", "these", "those", "there", "here", "just", "also",
  "very", "more", "most", "such", "only", "over", "out", "use", "using",
  "used", "like", "need", "would", "could", "should", "one", "two", "make",
  "made", "get", "got", "its", "it", "is", "to", "of", "in", "on", "or", "as",
  "at", "by", "an", "be", "do", "if", "no", "so", "up", "we", "he", "she", "my"
]);

// --- Types -------------------------------------------------------------------

export interface SuggestedNotebook {
  id: string;
  title: string;
  score: number;
}
export interface SuggestedTag {
  id: string;
  title: string;
  score: number;
}
export interface SuggestedColor {
  id: string;
  title: string;
  colorCode: string;
  score: number;
}
/** A similar note surfaced for direct Open / Link actions (title resolved by the
 *  caller via `titleFor`; falls back to the id when unresolved). */
export interface SuggestedNote {
  id: string;
  title: string;
  score: number;
}
export interface NoteSuggestions {
  notebooks: SuggestedNotebook[];
  tags: SuggestedTag[];
  colors: SuggestedColor[];
  /** Top similar notes (by weight) for the Open / Link actions. Always surfaced
   *  when there are matches — not subject to the assignment confidence gate. */
  notes: SuggestedNote[];
  /** Number of similar notes the aggregation ran over (0 → empty result). */
  matchedCount: number;
}

export interface SimilarNote {
  noteId: string;
  /** ∈ (0, 1] — confidence weight used by aggregation (scale-invariant). */
  weight: number;
}

export interface FindSimilarOptions {
  limit: number;
  /** Live (non-trashed/archived) note ids; when provided, other ids are dropped. */
  liveNoteIds?: ReadonlySet<string>;
  /** Resolves a note id to its title for the related-notes suggestions. The
   *  composable passes `useNotesStore().items` lookup; the engine stays free of
   *  the store. Falls back to the id when not provided / unresolved. */
  titleFor?: (id: string) => string | undefined;
}

// --- findSimilarNotes --------------------------------------------------------

/**
 * Find the top-K notes most similar to `queryText`, excluding `currentNoteId`.
 * Picks the semantic path when enabled (and an embedding is available), else
 * the lexical FTS fallback. Weights are clamped to (0,1] and the best weight per
 * note is kept (vector search can return multiple chunks per note).
 */
export async function findSimilarNotes(
  queryText: string,
  currentNoteId: string,
  opts: FindSimilarOptions
): Promise<SimilarNote[]> {
  const text = queryText.trim();
  if (!text) return [];
  const limit = Math.max(1, opts.limit);

  let results: SimilarNote[] = [];

  if (readSemanticSearchEnabled(getCurrentContext())) {
    results = await semanticSimilar(text, limit * 2);
  }
  if (results.length === 0) {
    results = await lexicalSimilar(text, limit * 2);
  }

  // Exclude self + filter to live notes (non-trashed/archived).
  results = results.filter(
    (r) => r.noteId !== currentNoteId && (!opts.liveNoteIds || opts.liveNoteIds.has(r.noteId))
  );

  // Sort by weight desc, take top K.
  results.sort((a, b) => b.weight - a.weight);
  return results.slice(0, limit);
}

/** Semantic path: embed once, KNN-search by vector, weight by cosine sim. */
async function semanticSimilar(text: string, limit: number): Promise<SimilarNote[]> {
  try {
    const vec = await computeEmbedding(text);
    if (!vec) return [];
    const rows = await searchVectorEmbeddingsByVector(vec, limit);
    if (rows.length === 0) return [];

    // vec0 distance ≈ cosine distance (1 − cos sim) for normalized vectors.
    // Keep the BEST (smallest distance → highest sim) chunk per note.
    const best = new Map<string, number>();
    for (const r of rows) {
      const sim = Math.max(0, 1 - r.distance);
      const prev = best.get(r.noteId);
      if (prev === undefined || sim > prev) best.set(r.noteId, sim);
    }
    let out: SimilarNote[] = Array.from(best.entries()).map(([noteId, weight]) => ({
      noteId,
      weight
    }));
    // If every distance ≥ 1 (all sims clamped to 0), fall back to rank decay so
    // aggregation's total weight isn't zero (which would break the ratio gate).
    if (out.every((r) => r.weight === 0)) {
      out = out.map((r, i) => ({ noteId: r.noteId, weight: 1 / (i + 1) }));
    }
    return out;
  } catch (e) {
    logger.error("[note-similarity] semantic path failed:", e);
    return [];
  }
}

/** Lexical path: distinctive-term OR query → FTS5/BM25 → decayed-rank weight. */
async function lexicalSimilar(text: string, limit: number): Promise<SimilarNote[]> {
  const terms = distinctiveTerms(text);
  if (terms.length === 0) return [];
  const orQuery = terms.join(" OR ");
  try {
    const db = getDatabase();
    const vg = await db.lookup.notesWithHighlighting(orQuery, db.notes.all, {
      sortBy: "relevance",
      sortDirection: "desc"
    });
    const count = Math.min(vg.length, limit);
    const out: SimilarNote[] = [];
    for (let i = 0; i < count; i++) {
      const got = await vg.item(i);
      if (got?.item) out.push({ noteId: got.item.id, weight: 1 / (i + 1) });
    }
    return out;
  } catch (e) {
    logger.error("[note-similarity] lexical path failed:", e);
    return [];
  }
}

/**
 * Tokenize `text` into distinctive lowercase alphanumeric terms: drop short
 * tokens, stopwords, and pure numbers; rank by frequency; take the top
 * `LEXICAL_MAX_TERMS`. Returns [] when the text has no usable terms (e.g. a
 * note that is all glue words), which yields no lexical matches (correct —
 * nothing found → nothing shown).
 */
export function distinctiveTerms(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length >= LEXICAL_MIN_TOKEN && !STOPWORDS.has(t) && !/^\d+$/.test(t));
  if (tokens.length === 0) return [];
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, LEXICAL_MAX_TERMS)
    .map(([t]) => t);
}

// --- keywordSuggestions (direct name-match signal) ---------------------------

/** Tokenize text into ordered, lowercased Unicode word/number tokens. Unlike
 *  `distinctiveTerms`, this keeps SHORT tokens (so "AI"/"NAS" survive) and
 *  handles non-ASCII (German umlauts, accents) via `\p{L}`. Used to match
 *  tag/notebook names directly against the note text. */
function unicodeTokens(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** True iff `phrase` occurs as a consecutive token subsequence of `haystack`
 *  (both ordered token lists). Single-word phrase → token membership; multi-word
 *  phrase → word-boundary phrase match (so "my notebook" ≠ "my … notebook"). */
function containsSubsequence(haystack: string[], phrase: string[]): boolean {
  if (phrase.length === 0 || phrase.length > haystack.length) return false;
  outer: for (let i = 0; i + phrase.length <= haystack.length; i++) {
    for (let j = 0; j < phrase.length; j++) {
      if (haystack[i + j] !== phrase[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** Baseline strength for a literal keyword match. Ranks above the similarity
 *  range (cosine/decayed-rank weights are < 1) so keyword matches top the merged
 *  set — a literal name hit is a stronger signal than a noisy aggregation. */
const KEYWORD_SCORE = 1.2;

/**
 * Direct keyword signal: scan `text` for existing tag/notebook names. NOT
 * subject to the similarity confidence gate — a literal name match is a strong
 * signal on its own.
 *
 *  • Tags match on ANY `/`-segment: "AI" matches AI/Hermes AND AI/Claude;
 *    "Hermes" matches AI/Hermes; "NAS" matches NAS. A segment is matched as a
 *    consecutive token subsequence (multi-word segments work; single-word
 *    segments match the token).
 *  • Notebooks match on the FULL title as a consecutive token subsequence, so
 *    "My Notebook" only matches "my notebook" (not "my" alone).
 *
 * Word boundaries come from Unicode tokenization (not regex `\b`, which
 * mishandles umlauts/accents). Score is `KEYWORD_SCORE` + a tiny frequency
 * bonus so ties break toward the more-mentioned name. Colors have no name to
 * match, so they are similarity-only.
 *
 * Cross-language matching (e.g. German "KI" → an English "AI" tag) is handled
 * by the multilingual semantic path (`granite-embedding`), not here — a
 * curated single-token glossary was removed as redundant with that model.
 */
export function keywordSuggestions(
  text: string,
  tags: readonly { id: string; title: string }[],
  notebooks: readonly { id: string; title: string }[]
): { tags: SuggestedTag[]; notebooks: SuggestedNotebook[] } {
  const haystack = unicodeTokens(text);
  if (haystack.length === 0) return { tags: [], notebooks: [] };
  const freq = new Map<string, number>();
  for (const t of haystack) freq.set(t, (freq.get(t) ?? 0) + 1);

  const scoreFor = (phrase: string[]): number => KEYWORD_SCORE + (freq.get(phrase[0] ?? "") ?? 0) * 0.01;

  const outTags: SuggestedTag[] = [];
  for (const tag of tags) {
    const segments = tag.title.split("/").map((s) => s.trim().toLowerCase()).filter(Boolean);
    for (const seg of segments) {
      const phrase = unicodeTokens(seg);
      if (phrase.length > 0 && containsSubsequence(haystack, phrase)) {
        outTags.push({ id: tag.id, title: tag.title, score: scoreFor(phrase) });
        break; // one segment match is enough; don't add the same tag twice
      }
    }
  }

  const outNbs: SuggestedNotebook[] = [];
  for (const nb of notebooks) {
    const phrase = unicodeTokens(nb.title.trim().toLowerCase());
    if (phrase.length > 0 && containsSubsequence(haystack, phrase)) {
      outNbs.push({ id: nb.id, title: nb.title, score: scoreFor(phrase) });
    }
  }

  return { tags: outTags, notebooks: outNbs };
}

/** Union two `{id,score}` lists by id, keeping the higher score, re-capped. */
export function mergeCapped<T extends { id: string; score: number }>(a: T[], b: T[], cap: number): T[] {
  const map = new Map<string, T>();
  for (const x of a) map.set(x.id, x);
  for (const x of b) {
    const ex = map.get(x.id);
    if (!ex || x.score > ex.score) map.set(x.id, x);
  }
  return Array.from(map.values()).sort((x, y) => y.score - x.score).slice(0, cap);
}

// --- aggregateSuggestions ----------------------------------------------------

interface Candidate {
  id: string;
  title: string;
  colorCode?: string | undefined;
  support: number; // Σ weight over notes that have this candidate
  count: number;   // # notes that have this candidate
}

/**
 * Read each similar note's notebook/tags/color (the `useNoteFooter.reload`
 * relations pattern) and aggregate, weighted by each note's similarity. A
 * candidate passes the confidence gate iff it appears in ≥ `MIN_SUPPORT_COUNT`
 * notes AND its weighted support is ≥ `SUPPORT_RATIO_OF_TOP` × the strongest
 * candidate in its category (relative-to-top). The top candidates per category
 * (by support) are returned, capped at `CAP_*`.
 *
 * The top `CAP_NOTES` similar notes (by weight) are also returned as
 * `notes` for the Open / Link actions — these are NOT gated (a match is a
 * match). `titleFor` resolves their titles (caller passes the notes-store
 * lookup). Empty arrays across all four categories signal "nothing found"
 * (the overlay stays hidden).
 */
export async function aggregateSuggestions(
  similar: SimilarNote[],
  titleFor?: (id: string) => string | undefined
): Promise<NoteSuggestions> {
  const empty: NoteSuggestions = { notebooks: [], tags: [], colors: [], notes: [], matchedCount: similar.length };
  if (similar.length === 0) return empty;

  const total = similar.reduce((s, n) => s + n.weight, 0);
  if (total <= 0) return empty;

  const db = getDatabase();
  const notebooks = new Map<string, Candidate>();
  const tags = new Map<string, Candidate>();
  const colors = new Map<string, Candidate>();

  const bump = (map: Map<string, Candidate>, id: string, title: string, weight: number, colorCode?: string) => {
    const existing = map.get(id);
    if (existing) {
      existing.support += weight;
      existing.count += 1;
    } else {
      map.set(id, { id, title, colorCode, support: weight, count: 1 });
    }
  };

  // Read assignments per similar note (matches `useNoteFooter.reload`).
  await Promise.all(
    similar.map(async (n) => {
      const ref = { id: n.noteId, type: "note" as const };
      try {
        const [nbItems, tagItems, colorItems] = await Promise.all([
          db.relations.to(ref, "notebook").resolve().catch(() => [] as Notebook[]),
          db.relations.to(ref, "tag").resolve().catch(() => [] as Tag[]),
          db.relations.to(ref, "color").resolve().catch(() => [] as Color[])
        ]);
        for (const nb of nbItems as Notebook[]) bump(notebooks, nb.id, nb.title || "Untitled", n.weight);
        for (const tg of tagItems as Tag[]) bump(tags, tg.id, tg.title || "Untitled", n.weight);
        for (const c of colorItems as Color[]) bump(colors, c.id, c.title || "Untitled", n.weight, c.colorCode);
      } catch {
        // Per-note failure doesn't abort the whole aggregation.
      }
    })
  );

  // Rank by weighted support, then surface the strongest cluster per category:
  // the top candidate plus any within `SUPPORT_RATIO_OF_TOP` of it, each needing
  // ≥ `MIN_SUPPORT_COUNT` notes. If the strongest candidate appears in only one
  // note, the category is empty (weak signal → nothing shown).
  const rank = (map: Map<string, Candidate>, cap: number): Candidate[] => {
    const all = Array.from(map.values()).sort((a, b) => b.support - a.support || b.count - a.count);
    const top = all[0];
    if (!top || top.count < MIN_SUPPORT_COUNT) return [];
    const threshold = top.support * SUPPORT_RATIO_OF_TOP;
    return all
      .filter((c) => c.count >= MIN_SUPPORT_COUNT && c.support >= threshold)
      .slice(0, cap);
  };

  // Diagnostic: log the RAW candidate landscape (before gating) so it's visible
  // whether the similar notes had any assignments at all vs. the gate filtering
  // them. Dev-only (the logger gates this off in packaged builds).
  const topOf = (m: Map<string, Candidate>) => {
    const arr = Array.from(m.values()).sort((a, b) => b.support - a.support);
    const t = arr[0];
    return t ? { distinct: arr.length, top: t.title, topCount: t.count, topSupport: Number(t.support.toFixed(3)) } : { distinct: 0 };
  };
  logger.log("[note-similarity] aggregate raw", {
    matched: similar.length,
    totalWeight: Number(total.toFixed(3)),
    notebooks: topOf(notebooks),
    tags: topOf(tags),
    colors: topOf(colors)
  });

  const nb = rank(notebooks, CAP_NOTEBOOKS).map((c) => ({ id: c.id, title: c.title, score: c.support }));
  const tg = rank(tags, CAP_TAGS).map((c) => ({ id: c.id, title: c.title, score: c.support }));
  const co = rank(colors, CAP_COLORS).map((c) => ({ id: c.id, title: c.title, colorCode: c.colorCode ?? "", score: c.support }));
  // Top similar notes for Open / Link — NOT gated. `similar` is already sorted
  // by weight desc (from `findSimilarNotes`); sort defensively anyway.
  const ns = similar
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, CAP_NOTES)
    .map((n) => ({ id: n.noteId, title: titleFor?.(n.noteId) ?? n.noteId, score: n.weight }));

  return { notebooks: nb, tags: tg, colors: co, notes: ns, matchedCount: similar.length };
}

/** Convenience: find + aggregate in one call. `opts.titleFor` resolves the
 *  related-notes titles (the composable passes a `useNotesStore().items` lookup). */
export async function computeNoteSuggestions(
  queryText: string,
  currentNoteId: string,
  opts: FindSimilarOptions
): Promise<NoteSuggestions> {
  const similar = await findSimilarNotes(queryText, currentNoteId, opts);
  return aggregateSuggestions(similar, opts.titleFor);
}