import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import type { Note } from "@notesnook-vue/contracts";
import { getDatabase } from "@/platform/bootstrap";
import { useNotesStore } from "@/stores/notes";

/**
 * Note-links store — incoming (backlinks) + outgoing note-to-note relations
 * for the active note, via `db.relations` (the same mechanism the properties
 * store uses for tags/notebooks). A link is a directional `note → note`
 * relation: `relations.add({note:a}, {note:b})` means *a links to b*.
 *
 * - Outgoing: notes the active note links to → `relations.from(note, "note")`
 *   (the `to` side of relations whose `from` is this note).
 * - Incoming: notes that link to the active note → `relations.to(note, "note")`
 *   (the `from` side of relations whose `to` is this note).
 *
 * Outgoing links are editable here (add via `link`, remove via `unlink`);
 * incoming links are read-only (a backlink lives on the *source* note — remove
 * it by editing that note, not this one). The store auto-(re)loads on active-
 * note change (`immediate`), mirroring the properties store. The Editor renders
 * the section below the tags; the contract test pins the relation direction.
 */
export interface NoteLinkRef {
  id: string;
  title: string;
}

/** Map a core `Note` to the minimal chip reference. "Untitled" fallback mirrors
 * the notes-list + properties mappers. */
function toLinkRef(n: Note): NoteLinkRef {
  return { id: n.id, title: n.title || "Untitled" };
}

export const useLinksStore = defineStore("links", () => {
  const notes = useNotesStore();

  /** Notes the active note links to (outgoing). */
  const outgoing = ref<NoteLinkRef[]>([]);
  /** Notes that link to the active note (incoming / backlinks). */
  const incoming = ref<NoteLinkRef[]>([]);
  /** True while links are (re)loading for the active note. */
  const loading = ref(false);
  /** True while a link/unlink mutation is in flight (gates the UI). */
  const busy = ref(false);
  /** Last mutation error, or `null`. Cleared on success. */
  const lastError = ref<string | null>(null);

  const activeNoteId = computed(() => notes.activeNote?.id ?? null);

  /** Reload outgoing + incoming for the active note. Never throws — a failure
   *  (e.g. a relation type the build doesn't support) just empties the lists. */
  async function load(): Promise<void> {
    const id = activeNoteId.value;
    if (!id) {
      outgoing.value = [];
      incoming.value = [];
      return;
    }
    loading.value = true;
    try {
      const db = getDatabase();
      const ref = { id, type: "note" as const };
      const [out, inc] = await Promise.all([
        db.relations.from(ref, "note").resolve().catch(() => []),
        db.relations.to(ref, "note").resolve().catch(() => [])
      ]);
      outgoing.value = (out as Note[]).map(toLinkRef);
      incoming.value = (inc as Note[]).map(toLinkRef);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[links] load failed:", e);
      outgoing.value = [];
      incoming.value = [];
    } finally {
      loading.value = false;
    }
  }

  /** Link the active note → `noteId` (outgoing). No-op for self-links. */
  async function link(noteId: string): Promise<boolean> {
    const id = activeNoteId.value;
    if (!id || noteId === id) return false;
    busy.value = true;
    try {
      const db = getDatabase();
      await db.relations.add(
        { id, type: "note" },
        { id: noteId, type: "note" }
      );
      await load();
      lastError.value = null;
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[links] link failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** Remove the active note → `noteId` outgoing link. */
  async function unlink(noteId: string): Promise<boolean> {
    const id = activeNoteId.value;
    if (!id) return false;
    busy.value = true;
    try {
      const db = getDatabase();
      await db.relations.unlink(
        { id, type: "note" },
        { id: noteId, type: "note" }
      );
      await load();
      lastError.value = null;
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[links] unlink failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  // Auto-(re)load when the active note changes. `immediate` so an already-open
  // note seeds the section on first mount.
  watch(activeNoteId, () => void load(), { immediate: true });

  return {
    outgoing,
    incoming,
    loading,
    busy,
    lastError,
    load,
    link,
    unlink
  };
});