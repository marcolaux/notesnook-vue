/**
 * Tag-mention (#) types (Phase 5.4). The `TagMention` node is an inline atom
 * chip that persists a `#tag` reference inside the note body; `TagSuggest` is
 * the `@tiptap/suggestion` extension that opens a picker on `#`.
 *
 * The chip caches `title` for display (the tag relation is the source of
 * truth — renaming the tag in the sidebar does NOT rewrite existing chips; a
 * later "resolve tagId → current title on load" pass can refresh that).
 */
export interface TagMentionAttributes {
  /** The tag's stable id (matches `db.tags` / the `tag`→`note` relation). */
  tagId: string | null;
  /** Cached display title, rendered as `#title` by the NodeView. */
  title: string;
}

export interface TagMentionOptions {
  /** Extra HTML attributes merged onto the chip's wrapping `<span>`. */
  HTMLAttributes: Record<string, unknown>;
}

/**
 * Options for the `reconcileTagMentions` command. `silent: true` sets the
 * `preventUpdate` transaction meta so the strip does NOT fire TipTap's
 * `onUpdate` — used on note load so stripping orphan chips doesn't mark the
 * note dirty / trigger an autosave. Omit it (dirty) when reconciling in
 * response to an active tag-removal, so the stripped content persists and a
 * stale reload doesn't bring the chip back.
 */
export interface ReconcileOptions {
  silent?: boolean;
}

/**
 * One row in the `#` suggestion popup. Existing tags carry their real `id`;
 * the synthetic "Create tag: <query>" row sets `isNew: true` and a sentinel
 * `id` (the real id is minted by `db.tags.add` when the host commits it).
 */
export interface TagSuggestionItem {
  id: string;
  title: string;
  isNew?: boolean;
}