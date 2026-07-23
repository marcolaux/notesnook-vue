/**
 * Per-pane note footer (`Editor.vue`) — the reactive backing for the tags +
 * note-links + word-count footer at the bottom of EACH editor pane. Unlike
 * the global `properties`/`links` stores (which are bound to the *active*
 * (focused) note), this composable is bound to a SPECIFIC note id and is
 * instantiated once per `Editor.vue`, so a background split pane's footer
 * reflects its own note — not the focused one. Cursor line/col stay focused-
 * only (a caret concept) and are rendered by the Editor from the status store.
 *
 * Data (tags, outgoing/incoming links) is read directly from `db.relations`
 * for the bound note id, mirroring the two stores' loaders (kept here so the
 * footer doesn't depend on the active-note singleton refs). Mutations reuse
 * the stores' id-aware mutators (`properties.addTag(id, noteId)`,
 * `links.link(target, sourceNoteId)`, …) for the DB write + `notes.load()`,
 * then `reload()` the local state — the stores' internal active-note reload is
 * a harmless no-op when this note isn't the active one.
 *
 * `wordCount` is a plain ref the Editor pushes to (from its own TipTap text on
 * every `update`, focused or not) — no editor coupling lives here, so the
 * composable stays headless-testable.
 */
import { ref, watch, type Ref } from "vue";
import type { Note, Tag } from "@notesnook-vue/contracts";
import { getDatabase } from "@/platform/bootstrap";
import { usePropertiesStore } from "@/stores/properties";
import { useLinksStore, toLinkRef, type NoteLinkRef } from "@/stores/links";
import { useCollectionsStore } from "@/stores/collections";
import {
  toAssignedTag,
  uniqueById,
  type AssignedTag
} from "@/utils/properties";

export interface NoteFooter {
  /** Tags assigned to this pane's note. */
  tags: Ref<AssignedTag[]>;
  /** Notes this pane's note links to (outgoing). */
  outgoing: Ref<NoteLinkRef[]>;
  /** Notes that link to this pane's note (incoming / backlinks). */
  incoming: Ref<NoteLinkRef[]>;
  /** Live word count for this pane's note, pushed by the Editor. */
  wordCount: Ref<number>;
  /** True while assignments/links are (re)loading. */
  loading: Ref<boolean>;
  /** Reload tags + links for the bound note (never throws). */
  reload: () => Promise<void>;
  /** Attach an existing tag (id-aware DB write + local reload). */
  addTag: (tagId: string) => Promise<void>;
  /** Detach a tag (id-aware DB write + local reload). */
  removeTag: (tagId: string) => Promise<void>;
  /** Create a new tag + attach it; refreshes the sidebar. Returns the new
   *  `{id,title}` or `null` on failure (mirrors `properties.createTag`). */
  createTag: (title: string) => Promise<AssignedTag | null>;
  /** Link this pane's note → `targetId` (outgoing). No-op for self-links. */
  link: (targetId: string) => Promise<void>;
  /** Remove this pane's note → `targetId` outgoing link. */
  unlink: (targetId: string) => Promise<void>;
}

export function useNoteFooter(noteId: Ref<string | null>): NoteFooter {
  const properties = usePropertiesStore();
  const links = useLinksStore();
  const collections = useCollectionsStore();

  const tags = ref<AssignedTag[]>([]);
  const outgoing = ref<NoteLinkRef[]>([]);
  const incoming = ref<NoteLinkRef[]>([]);
  const wordCount = ref(0);
  const loading = ref(false);

  async function reload(): Promise<void> {
    const id = noteId.value;
    if (!id) {
      tags.value = [];
      outgoing.value = [];
      incoming.value = [];
      return;
    }
    loading.value = true;
    try {
      const db = getDatabase();
      const ref = { id, type: "note" as const };
      const [tagItems, out, inc] = await Promise.all([
        db.relations.to(ref, "tag").resolve().catch(() => [] as Tag[]),
        db.relations.from(ref, "note").resolve().catch(() => [] as Note[]),
        db.relations.to(ref, "note").resolve().catch(() => [] as Note[])
      ]);
      tags.value = uniqueById((tagItems as Tag[]).map(toAssignedTag));
      outgoing.value = (out as Note[]).map(toLinkRef);
      incoming.value = (inc as Note[]).map(toLinkRef);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[note-footer] reload failed:", e);
      tags.value = [];
      outgoing.value = [];
      incoming.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function addTag(tagId: string): Promise<void> {
    const id = noteId.value;
    if (!id) return;
    await properties.addTag(tagId, id);
    await reload();
  }

  async function removeTag(tagId: string): Promise<void> {
    const id = noteId.value;
    if (!id) return;
    await properties.removeTag(tagId, id);
    await reload();
  }

  async function createTag(title: string): Promise<AssignedTag | null> {
    const id = noteId.value;
    if (!id) return null;
    const created = await properties.createTag(title, id);
    if (!created) return null;
    await collections.load();
    await reload();
    return created;
  }

  async function link(targetId: string): Promise<void> {
    const id = noteId.value;
    if (!id) return;
    await links.link(targetId, id);
    await reload();
  }

  async function unlink(targetId: string): Promise<void> {
    const id = noteId.value;
    if (!id) return;
    await links.unlink(targetId, id);
    await reload();
  }

  // Auto-(re)load when the bound note changes. `immediate` so an already-open
  // note seeds the footer on first mount.
  watch(noteId, () => void reload(), { immediate: true });

  return { tags, outgoing, incoming, wordCount, loading, reload, addTag, removeTag, createTag, link, unlink };
}