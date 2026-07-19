/**
 * Pure note-properties logic (Phase 5.1) — content stats (word/char/line
 * counts from the note HTML), the set of per-note toggles the properties
 * panel exposes, and date formatting. Kept framework-agnostic so it is
 * unit-tested in isolation (see `tests/contract/properties.spec.ts`). The
 * `usePropertiesStore` composes these for the active note.
 *
 * Bounded to the four toggles `@notesnook/core`'s `Notes` collection exposes
 * dedicated setters for (`pin`/`favorite`/`readonly`/`localOnly`). Tags and
 * notebooks live behind `db.relations` (the `Note.tags`/`Note.notebooks`
 * fields are `@deprecated`); vault-lock and archive are Phase 6; spell-check
 * is a `db.settings` setting, not a per-note toggle — all deferred.
 */

import { countWords } from "@/utils/status";

/** Per-note toggles the properties panel exposes, backed by `db.notes.*`. */
export type ToggleKey = "pinned" | "favorite" | "readonly" | "localOnly";

export const TOGGLE_KEYS: readonly ToggleKey[] = ["pinned", "favorite", "readonly", "localOnly"];

export const TOGGLE_LABELS: Record<ToggleKey, string> = {
  pinned: "Pinned",
  favorite: "Favorite",
  readonly: "Read only",
  localOnly: "Disable sync"
};

export type ToggleState = Record<ToggleKey, boolean>;

export interface NoteStats {
  words: number;
  chars: number;
  lines: number;
}

/**
 * Strip HTML to plain text, inserting newlines at block boundaries so line
 * counts are meaningful. Decodes the common entities. DOM-free (regex) so it
 * runs in a node test environment and is fully deterministic. Not a full
 * HTML serializer — it is a counting aid, not a renderer.
 */
export function htmlToText(html: string): string {
  if (!html) return "";
  let s = html.replace(/<\/(p|div|h[1-6]|li|ul|ol|blockquote|pre|tr|td|th|table)>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Collapse runs of newlines (block-close noise) to a single one + trim the
  // ends. Safe for the non-empty-line count and yields clean plain text.
  return s.replace(/\n{2,}/g, "\n").replace(/^\n+|\n+$/g, "");
}

/**
 * Word/char/line counts for a note's HTML body. Words = whitespace tokens of
 * the trimmed text; chars = stripped-text length (incl. whitespace/newlines);
 * lines = number of non-empty block lines. An empty note is all zeros.
 */
export function noteStats(html: string): NoteStats {
  const text = htmlToText(html);
  return {
    words: countWords(text),
    chars: text.length,
    lines: text === "" ? 0 : text.split(/\n/).filter((l) => l.trim() !== "").length
  };
}

/** Absolute, locale-formatted date for the created/modified fields. "" for 0. */
export function formatAbsoluteDate(ts: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}