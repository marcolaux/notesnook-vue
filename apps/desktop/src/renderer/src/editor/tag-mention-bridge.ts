/*
Tag-mention bridge — wires the `#` tag picker (the `TagSuggest` editor-vue
extension) to the renderer's Pinia stores and keeps the inline `#tag` chips in
sync with the note's tag assignments (two-way). Twin of `attachments-bridge.ts`'s
`wireAttachmentStorage`: the pure editor package (`packages/editor-vue`) has no
access to Pinia / `db`, so this renderer-only module injects hooks onto
`editor.storage`, which `TagSuggest` / the reconcile command read.

Storage hooks injected:
  - `getTagSuggestions(query)` → `buildTagSuggestions(collections.tags, query)`
    (pure, subsequence filter + "Create tag" row) using the cached sidebar tag
    list. Already-assigned tags are NOT excluded — a `#tag` reference can be
    inserted for an already-assigned tag; `assignTag` is idempotent (core
    relations are unique by pair, so `addTag` on an already-assigned tag no-ops
    at the relation layer).
  - `assignTag(item)` → for an existing tag, `footer.addTag(id)` (id-aware,
    bound to this pane's note); for a `isNew` row, `footer.createTag(title)`
    (which mints the id via `db.tags.add` + links it) then refreshes the sidebar
    so the new tag appears there. Returns `{id, title}` so the editor can
    insert the chip with the correct `tagId` (the create case needs the freshly
    minted id for persistence).
  - `unassignTag(tagId)` → `footer.removeTag(tagId)` (id-aware, idempotent).
    Called by the deletion handler below when the user backspaces/deletes a
    chip, so removing a chip also unlinks the tag from the note.
  - `navigateToTag(tagId)` → `goToCollection("tag", tagId)` (select + filter the
    notes list + route to `/all`). Read by the `TagMentionView` node-view's chip
    click handler so clicking an inline `#tag` chip jumps to that tag's list
    (the current note stays open in the editor; only the list is re-filtered).

Two-way sync (the chip is a visual; the `tag`→`note` relation is the source of
truth):
  - Tag removed → chip stripped: a `watch` on `footer.tags` (this pane's own
    assigned tags, bound to its note — NOT the global active note) re-runs the
    `reconcileTagMentions` command (dirty — persists the stripped content so a
    stale reload doesn't bring the chip back). Because the ref is per-note, no
    focus gate is needed — a background split pane reconciles its own chips.
    The Editor.vue load path also runs a `silent` (non-dirty) reconcile on open
    so a note with orphan chips (e.g. a tag removed while the note was closed,
    or on another device) is cleaned on open without an eager DB rewrite.
  - Chip deleted → tag unassigned: a `transaction` listener diffs the set of
    chip `tagId`s before/after each transaction and, for any that disappeared in
    a USER transaction (not programmatic), calls `unassignTag`. Programmatic
    transactions are skipped via meta: `preventUpdate` (TipTap sets it for
    `setContent(…, false)` loads) and `tagMentionReconcile` (set by the reconcile
    command) — so loads and the reconcile's own strips don't re-trigger
    `removeTag` (no feedback loop).

`getNoteId` is a getter (not a captured value) so the bridge stays valid across
draft→promote, where the editor instance is stable but the note id becomes set
only after the first keystroke. When no note is resolved yet (draft not
promoted), `assignTag` returns `null` and the editor skips the chip insert
(inserting a chip with no resolvable tag would orphan the relation) — the user
can re-trigger after the draft promotes.

Returns a disposer that removes the `transaction` listener and stops the
`footer.tags` watch; Editor.vue calls it on editor destroy / component unmount.
*/
import { watch } from "vue";
import type { Editor } from "@tiptap/vue-3";
import type { Transaction } from "@tiptap/pm/state";
import type { TagSuggestionItem } from "@notesnook-vue/editor-vue";
import {
  collectTagMentionTagIds,
  diffDeletedTagIds,
  RECONCILE_META
} from "@notesnook-vue/editor-vue";
import { useCollectionsStore } from "@/stores/collections";
import { buildTagSuggestions } from "@/utils/tag-mention";
import { goToCollection } from "@/utils/collection-nav";
import type { NoteFooter } from "@/composables/use-note-footer";

export function wireTagMention(
  editor: Editor,
  getNoteId: () => string | null,
  footer: NoteFooter
): () => void {
  const storage = editor.storage as Record<string, unknown>;

  storage.getTagSuggestions = (query: string): TagSuggestionItem[] => {
    const collections = useCollectionsStore();
    return buildTagSuggestions(collections.tags, query);
  };

  storage.assignTag = async (
    item: TagSuggestionItem
  ): Promise<{ id: string; title: string } | null> => {
    const noteId = getNoteId();
    if (!noteId) return null;
    if (item.isNew) {
      // `footer.createTag` mints the tag, attaches it to THIS pane's note, and
      // reloads the per-pane footer tags (so the chip appears in the footer).
      const created = await footer.createTag(item.title);
      if (!created) return null;
      return { id: created.id, title: created.title };
    }
    await footer.addTag(item.id);
    return { id: item.id, title: item.title };
  };

  // Chip-deleted → unassign the tag from THIS pane's note. Id-aware + idempotent.
  storage.unassignTag = (tagId: string): void => {
    if (!getNoteId()) return;
    void footer.removeTag(tagId);
  };

  // Chip-clicked → navigate to the tag's note list (keep the current note open
  // in the editor; only the notes list is re-filtered). Read by the
  // `TagMentionView` node-view. No-op when the chip has no resolvable `tagId`
  // (shouldn't normally occur — the insert path skips chips without a real id).
  storage.navigateToTag = (tagId: string | null): void => {
    if (!tagId) return;
    void goToCollection("tag", tagId);
  };

  // --- Chip-deletion detection (reverse direction) ---------------------------
  // Diff the chip `tagId` set before/after each transaction; for ids that
  // disappeared in a USER transaction, unassign the tag. Skipped for
  // programmatic transactions (note loads + our own reconcile strips) via meta.
  let prevTagIds = collectTagMentionTagIds(editor.state.doc);
  const onTransaction = ({ transaction: tr }: { transaction: Transaction }): void => {
    if (!tr.docChanged) return;
    const programmatic =
      tr.getMeta("preventUpdate") === true || tr.getMeta(RECONCILE_META) === true;
    const next = collectTagMentionTagIds(editor.state.doc);
    const removed = diffDeletedTagIds(prevTagIds, next);
    prevTagIds = next;
    if (programmatic || removed.length === 0) return;
    const unassign = storage.unassignTag as ((id: string) => void) | undefined;
    for (const id of removed) unassign?.(id);
  };
  editor.on("transaction", onTransaction);

  // --- Tag-removed → strip chip (forward direction, per-pane) ----------------
  // When THIS pane's assigned tags change (a tag removed/added via the footer,
  // properties panel, or context menu), re-reconcile this editor's chips. The
  // `footer.tags` ref is bound to this pane's own note (not the global active
  // note), so NO focus gate is needed — a background split pane reconciles its
  // own chips against its own tags. Dirty (no `silent`) so a removal persists
  // the stripped content and a stale reload doesn't reintroduce the chip. A
  // no-op reconcile (nothing to strip — e.g. a tag was added) returns false and
  // dispatches nothing, so adding a tag via `#` doesn't trigger a spurious save.
  const stop = watch(
    () => footer.tags.value,
    () => {
      if (editor.isDestroyed) return;
      const ids = footer.tags.value.map((t) => t.id);
      editor.commands.reconcileTagMentions(ids);
    },
    { deep: true }
  );

  return () => {
    editor.off("transaction", onTransaction);
    stop();
  };
}