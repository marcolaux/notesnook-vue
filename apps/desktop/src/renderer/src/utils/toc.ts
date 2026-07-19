/**
 * Pure table-of-contents extraction (Phase 5.2) — pull the note's headings
 * (h1–h6) with their ids + text from the HTML body so the ToC miniMap can
 * render them and click-to-scroll. Kept framework-agnostic + DOM-free (regex)
 * so it runs in a node test environment and is deterministic. The live,
 * editor-state-driven ToC (re-deriving on every edit) + the click→cursor-jump
 * wiring are on-site; this util + the `useTocStore` computed are the headless
 * foundation.
 *
 * Heading ids: the editor (TipTap) assigns ids to headings; we reuse them. If
 * a heading has no id, a slug is derived from its text (deterministic, deduped
 * with a counter) so the miniMap always has a scroll target.
 */

export interface TocItem {
  /** The heading's id (explicit if present, else a slug derived from text). */
  id: string;
  /** Heading level 1–6. */
  level: number;
  /** Visible heading text (inline tags stripped, entities decoded). */
  text: string;
}

const HEADING_RE = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;

function extractId(attrs: string): string | undefined {
  const m = attrs.match(/\bid\s*=\s*"([^"]*)"/i);
  return m ? m[1] : undefined;
}

/** Strip inline tags + decode the common entities for the visible heading text. */
function headingText(inner: string): string {
  return inner
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Deterministic slug from text: lowercase, non-alnum→`-`, trimmed + deduped
 * with a `-2`, `-3`, … suffix via the `seen` set. */
function slugify(text: string, seen: Set<string>): string {
  let base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!base) base = "heading";
  let slug = base;
  let n = 2;
  while (seen.has(slug)) {
    slug = `${base}-${n++}`;
  }
  seen.add(slug);
  return slug;
}

/**
 * Extract the ordered list of headings from a note's HTML body. Empty/blank
 * headings are skipped. Explicit ids are reused; otherwise a slug is derived
 * (and tracked in a per-call `seen` set so duplicates disambiguate, while an
 * explicit id repeated in the document is kept as-is).
 */
export function extractTableOfContents(html: string): TocItem[] {
  if (!html) return [];
  const out: TocItem[] = [];
  const slugSeen = new Set<string>();
  HEADING_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HEADING_RE.exec(html)) !== null) {
    // The regex captures all three groups on a match, but
    // noUncheckedIndexedAccess types them as `string | undefined` — assert.
    const level = Number(m[1]!);
    const text = headingText(m[3]!);
    if (!text) continue;
    const explicitId = extractId(m[2]!);
    const id = explicitId ?? slugify(text, slugSeen);
    out.push({ id, level, text });
  }
  return out;
}