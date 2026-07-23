/**
 * Pure doc-scanning helpers for note-links. {@link collectNoteLinkIds} walks a
 * ProseMirror doc and returns the distinct note ids referenced by inline
 * `nn://note/<id>` `link` marks — used by the host bridge to keep the footer's
 * outgoing/backlinks relations in sync with the note body (mirroring the
 * tag-mention chip↔relation sync).
 */
import type { Node } from "@tiptap/pm/model";
import { noteIdFromLink } from "./internal-link";

/**
 * Collect the set of distinct note ids referenced by inline `nn://note/<id>`
 * `link` marks in `doc`. Non-`nn://note/` links and duplicates are ignored.
 * A link mark that spans several text nodes is counted once (the id set dedups).
 */
export function collectNoteLinkIds(doc: Node): string[] {
  const ids = new Set<string>();
  doc.descendants((node) => {
    const link = node.marks.find((m) => m.type.name === "link");
    if (link) {
      const id = noteIdFromLink(link.attrs.href as string | null | undefined);
      if (id) ids.add(id);
    }
    return true;
  });
  return [...ids];
}

/** Diff two id lists: ids in `next` but not `prev`. */
export function addedNoteLinkIds(prev: string[], next: string[]): string[] {
  const set = new Set(prev);
  return next.filter((id) => !set.has(id));
}

/** Diff two id lists: ids in `prev` but not `next`. */
export function removedNoteLinkIds(prev: string[], next: string[]): string[] {
  const set = new Set(next);
  return prev.filter((id) => !set.has(id));
}