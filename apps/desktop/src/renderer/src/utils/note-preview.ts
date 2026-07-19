/**
 * Note-list preview extraction (Phase 3.3 follow-up).
 *
 * The notes list (§4.2) shows, per entry, the **first image as a thumbnail**
 * and a **progress bar** (`x / y` checked) when a note contains a checklist.
 * Neither is stored on the `Note` itself — both live in the note's HTML body
 * (Notesnook stores `type: "tiptap"` content as an HTML string). These pure
 * helpers parse that HTML with `DOMParser` (available in the Electron
 * renderer and in happy-dom tests) and return a small preview descriptor the
 * list renders.
 *
 * Thumbnail: the first `<img>`'s `src`. Attachment-backed images render with a
 * `data-hash` and **no** inline `src` (the blob is resolved lazily via the
 * Phase-6 attachments bridge), so they yield no thumbnail yet. Inline
 * data-URL images (e.g. the seeded SVG) and remote-URL images round-trip
 * directly.
 *
 * Checklist: the task-list node keeps its `stats` attr as `rendered: false`,
 * so it is absent from the stored HTML. The node's own `parseHTML` re-derives
 * it by counting `li.checklist--item` / `li.checklist--item.checked`; we mirror
 * that exactly here (across all root task lists in the note → overall progress).
 */

export interface ChecklistProgress {
  /** Number of checked checklist items (`li.checklist--item.checked`). */
  checked: number;
  /** Total checklist items (`li.checklist--item`). */
  total: number;
}

export interface NotePreview {
  /** First `<img>` `src`, or `null` when the note has no renderable image. */
  thumbnail: string | null;
  /** Checklist progress, or `null` when the note has no checklist items. */
  checklist: ChecklistProgress | null;
}

export const EMPTY_PREVIEW: NotePreview = { thumbnail: null, checklist: null };

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/** Extract the first renderable image `src` from the note body, if any. */
function extractThumbnail(doc: Document): string | null {
  for (const img of Array.from(doc.querySelectorAll("img"))) {
    const src = img.getAttribute("src");
    if (src) return src;
  }
  return null;
}

/** Count checklist items across all root task lists in the note body. */
function extractChecklist(doc: Document): ChecklistProgress | null {
  const total = doc.querySelectorAll("li.checklist--item").length;
  if (total === 0) return null;
  const checked = doc.querySelectorAll("li.checklist--item.checked").length;
  return { checked, total };
}

/**
 * Parse a note's HTML body into a list-preview descriptor.
 *
 * Robust to empty / malformed HTML: a failed parse yields {@link EMPTY_PREVIEW}.
 * The function never throws into the render path.
 */
export function extractNotePreview(html: string): NotePreview {
  if (!html) return EMPTY_PREVIEW;
  try {
    const doc = parse(html);
    return {
      thumbnail: extractThumbnail(doc),
      checklist: extractChecklist(doc)
    };
  } catch {
    // Malformed HTML or a hostile parser environment — never break the list.
    return EMPTY_PREVIEW;
  }
}