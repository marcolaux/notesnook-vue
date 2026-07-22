/**
 * Pure note-history diff helpers (note-history timeline sidebar).
 *
 * A revision's body (`SessionContentItem.data`) is the note's content as a
 * `type: "tiptap"` HTML string (or a `Cipher` when vault-locked). To show
 * readable per-version diffs in the timeline we collapse that HTML into an
 * array of block text lines (one line per paragraph / heading / list item /
 * quote / code line) and run a classic LCS line diff between adjacent
 * versions. HTML→lines uses `DOMParser` (available in the Electron renderer
 * and in happy-dom tests — see `tests/contract/note-history-diff.spec.ts`),
 * the same approach as `utils/note-preview.ts`.
 *
 * Framework-agnostic + side-effect-free so it is unit-tested in isolation.
 */

/** One line of a line-diff: added in `b`, deleted from `a`, or common context. */
export interface DiffLine {
  type: "add" | "del" | "ctx";
  text: string;
}

/** Block-level selectors whose text content becomes one diff line each. */
const BLOCK_SELECTORS =
  "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th, dd, dt, figcaption";

/**
 * Collapse a `tiptap` HTML body into one trimmed text line per block element.
 * Empty/whitespace-only lines are dropped. Non-HTML or empty input → `[]`.
 * Inline-only content (text directly under `<body>` with no block wrapper)
 * falls back to the whole body's text split on newlines, so a bare-text note
 * still diffs sensibly.
 */
export function htmlToLines(html: string): string[] {
  if (!html || typeof html !== "string") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = Array.from(doc.querySelectorAll(BLOCK_SELECTORS));
  if (blocks.length > 0) {
    const lines: string[] = [];
    for (const el of blocks) {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text) lines.push(text);
    }
    return lines;
  }
  // No block elements — treat the raw text content as lines.
  const raw = (doc.body.textContent ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Longest-common-subsequence line diff. Returns a sequence of {@link DiffLine}s
 * reconstructing `b` from `a`: `add` lines are present in `b` only, `del` lines
 * in `a` only, `ctx` lines common to both. Equal context lines that appear
 * identically in both are preserved in order. Pure + allocates O(a.length *
 * b.length) for the DP table — fine for note-sized bodies (hundreds of lines).
 */
export function diffLines(a: readonly string[], b: readonly string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i..] and b[j..].
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        a[i] === b[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "ctx", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ type: "del", text: a[i]! });
      i++;
    } else {
      out.push({ type: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) {
    out.push({ type: "del", text: a[i]! });
    i++;
  }
  while (j < m) {
    out.push({ type: "add", text: b[j]! });
    j++;
  }
  return out;
}

/**
 * Diff two `tiptap` HTML bodies: collapse each to lines, then `diffLines`.
 * `prevHtml` is the older version, `currHtml` the newer — so `add` lines are
 * what the newer version added and `del` lines what it removed.
 */
export function diffHtml(prevHtml: string, currHtml: string): DiffLine[] {
  return diffLines(htmlToLines(prevHtml), htmlToLines(currHtml));
}