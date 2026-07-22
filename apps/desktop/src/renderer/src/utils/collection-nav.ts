/**
 * Collection navigation helper. Selects a collection (notebook/tag/color),
 * restricts the notes list to it, and shows the notes view (`/all`). Shared by
 * the sidebar, the editor footer tag chips, and the inline `#tag` chip click
 * handler (injected onto `editor.storage` by `tag-mention-bridge`), so there is
 * one source of truth for the "go to this collection's note list" flow.
 *
 * The active note id intentionally stays out of the URL (Phase 3.5 design), so
 * navigating to a tag's list keeps the current note open in the editor and only
 * re-filters the notes list — clicking a `#tag` chip does not close the note.
 */
import { router } from "@/router";
import { useCollectionsStore, type CollectionType } from "@/stores/collections";
import { useNotesStore } from "@/stores/notes";

export async function goToCollection(
  type: CollectionType,
  id: string
): Promise<void> {
  const collections = useCollectionsStore();
  const notes = useNotesStore();
  collections.select(type, id);
  await notes.filterByCollection(type, id);
  void router.push("/all");
}