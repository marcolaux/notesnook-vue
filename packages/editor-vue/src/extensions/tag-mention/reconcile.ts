/**
 * Tag-mention reconcile helpers (Phase 5.4).
 *
 * The `tagMention` chip caches a `tagId`, but the `tag`→`note` relation is the
 * source of truth. These pure helpers walk a ProseMirror doc to find chips whose
 * `tagId` is no longer assigned (orphans) so the host can strip them, and diff
 * the set of chip ids across a transaction so the host can unassign tags whose
 * chip the user just deleted. Pure over `Node` so they're testable headlessly.
 */
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";

/**
 * ProseMirror transaction meta key set by the `reconcileTagMentions` command.
 * The host's deletion-detection handler reads it to skip the unassign side-
 * effect for chips the reconcile itself just removed (otherwise reconcile →
 * `removeTag` → assignment reload → reconcile would loop, and a chip stripped
 * because its tag was already removed would re-fire an unassign).
 */
export const RECONCILE_META = "tagMentionReconcile";

/** A chip node's resolved position + size, for range deletion in a transaction. */
export interface TagMentionRange {
  pos: number;
  size: number;
}

/**
 * Collect the `tagId` of every `tagMention` node in `doc` that carries a string
 * id. Chips with a `null`/missing `tagId` (shouldn't normally occur) are skipped.
 */
export function collectTagMentionTagIds(doc: ProsemirrorNode): Set<string> {
  const ids = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name === "tagMention") {
      const id = node.attrs.tagId;
      if (typeof id === "string" && id.length > 0) ids.add(id);
    }
    return true;
  });
  return ids;
}

/**
 * Find every `tagMention` node whose `tagId` is absent from `allowed` — i.e. the
 * chips that should be stripped because their tag is no longer assigned to the
 * note. Returns positions in document order; the command sorts descending
 * before deleting so earlier positions stay valid.
 */
export function findOrphanTagMentionRanges(
  doc: ProsemirrorNode,
  allowed: Set<string>
): TagMentionRange[] {
  const ranges: TagMentionRange[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "tagMention") {
      const id = node.attrs.tagId;
      if (typeof id === "string" && id.length > 0 && !allowed.has(id)) {
        ranges.push({ pos, size: node.nodeSize });
      }
    }
    return true;
  });
  return ranges;
}

/**
 * Tag ids present in `prev` but absent in `next` — i.e. chips that disappeared
 * across a transaction. Used by the host's deletion-detection handler to decide
 * which tags to unassign after a user-initiated chip deletion. Pure so the
 * diff logic is testable without an editor.
 */
export function diffDeletedTagIds(prev: Set<string>, next: Set<string>): string[] {
  const removed: string[] = [];
  for (const id of prev) {
    if (!next.has(id)) removed.push(id);
  }
  return removed;
}