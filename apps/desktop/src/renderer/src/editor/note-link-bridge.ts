/*
Note-link bridge — wires the inline `@`/`[[` note-link picker (the `NoteSuggest`
editor-vue extension) to the renderer's Pinia stores + `db`, wires the `link`
mark's click-handler to "open the linked note in a new tab", and keeps the
footer's outgoing/backlinks relations in sync with the `nn://` links in the
note body (mirroring the tag-mention chip↔relation two-way sync).

Storage hooks injected:
  - `getNoteSuggestions(query)` → in-memory subsequence search over the cached
    notes list (`filterByKey` over `notes.items`, excluding THIS pane's note so
    a note can't link to itself). Synchronous (the Suggestion `items` callback
    is sync); instant, consistent with the `#` tag picker.
  - `getContentBlocks(noteId)` → `await db.notes.contentBlocks(noteId)`, mapped
    to `{ id, type, content }` for the picker's block drilldown. `[]` for a
    locked/missing note.
  - `openLink(href, newTab)` → the `link` mark click-handler target. For an
    `nn://note/<id>` link, `layout.openTab(groupId, noteId)` opens the target in
    a NEW TAB in this pane's group (blockId scroll is a follow-up). External
    hrefs → OS browser via `window.open`.
  - `noteLinkLabels` → i18n strings the picker reads on each mount.
  - `syncNoteLinks()` → load/promote reconcile: add `db.relations` note→note
    for every inline `nn://note/<id>` in the doc that lacks a relation, then
    reload the per-pane footer. Called by Editor.vue after `setContent` so a
    note written elsewhere (inline links but no relations) seeds its outgoing
    chips on open, and by the promote watcher when a draft gets its id.

Inline-link ↔ relation sync (the `link` mark in the body is the visual; the
`note`→`note` relation is the footer/backlink source of truth):
  - A `transaction` listener diffs the set of inline note-link ids before/after
    each transaction. For ids that appeared/ disappeared in a USER transaction
    (not a programmatic load — `preventUpdate` meta), it calls `footer.link`/
    `footer.unlink` (id-aware DB write + per-pane reload), so the footer's
    outgoing chips update live as the user inserts/removes inline links. This
    is the same shape as the tag-mention chip-deletion handler. (Caveat, same
    as tag-mention: removing an inline link to a note also unlinks a relation
    that was added via the footer "Link to note" input — relations are the
    shared source of truth and aren't provenance-tagged.)
  - `getNoteId` is a getter (not a captured value) so the bridge stays valid
    across draft→promote. A `watch` on it runs `syncNoteLinks` on null→id so a
    draft that accumulated inline links before it had an id seeds its relations
    on promote.

Returns a disposer that removes the transaction listener + stops the watch.
*/
import { watch } from "vue";
import type { Editor } from "@tiptap/vue-3";
import type { Transaction } from "@tiptap/pm/state";
import {
  filterByKey,
  isInternalLink,
  parseInternalLink,
  collectNoteLinkIds,
  addedNoteLinkIds,
  removedNoteLinkIds,
  type NoteSuggestionItem,
  type ContentBlockItem,
  type NoteLinkLabels
} from "@notesnook-vue/editor-vue";
import { getDatabase } from "@/platform/bootstrap";
import { useNotesStore } from "@/stores/notes";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import i18n from "@/i18n";
import type { NoteFooter } from "@/composables/use-note-footer";

export function wireNoteLink(
  editor: Editor,
  getNoteId: () => string | null,
  getGroupId: () => string,
  footer: NoteFooter
): () => void {
  const storage = editor.storage as Record<string, unknown>;

  // Labels are read on each popup mount (render.ts onStart), so a locale change
  // is picked up the next time the picker opens.
  const t = i18n.global.t.bind(i18n.global);
  storage.noteLinkLabels = {
    searchPlaceholder: t("linkNote.searchPlaceholder"),
    blockSearchPlaceholder: t("linkNote.blockSearchPlaceholder"),
    linkWholeNote: t("linkNote.linkWholeNote"),
    backToNotes: t("linkNote.backToNotes"),
    noResults: t("linkNote.noResults"),
    noBlocks: t("linkNote.noBlocks"),
    emptyBlock: t("linkNote.emptyBlock"),
    createNote: t("linkNote.createNote")
  } satisfies NoteLinkLabels;

  storage.getNoteSuggestions = (query: string): NoteSuggestionItem[] => {
    const notes = useNotesStore();
    const excludeId = getNoteId();
    return filterByKey(notes.items, query, (n) => [n.title || "Untitled"])
      .filter((n) => n.id !== excludeId)
      .slice(0, 12)
      .map((n) => ({ id: n.id, title: n.title || "Untitled" }));
  };

  storage.createNoteForLink = async (
    title: string
  ): Promise<{ id: string; title: string } | null> => {
    try {
      const notes = useNotesStore();
      const cleanTitle = title.trim() || "Untitled";
      const id = await notes.create({ title: cleanTitle, openNote: false, content: "" });
      return { id, title: cleanTitle };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[note-link-bridge] createNoteForLink failed:", e);
      return null;
    }
  };

  storage.getContentBlocks = async (noteId: string): Promise<ContentBlockItem[]> => {
    try {
      const db = getDatabase();
      const blocks = (await db.notes.contentBlocks(noteId)) as Array<{
        id: string;
        type: string;
        content: string;
      }>;
      return blocks.map((b) => ({ id: b.id, type: b.type, content: b.content }));
    } catch {
      // A locked or missing note yields no blocks — the picker then links the
      // whole note instead of drilling in. Never throw into the editor.
      return [];
    }
  };

  storage.pickLocalFile = async (): Promise<{ href: string; title: string } | null> => {
    try {
      const file = await desktop.dialog.openFile.mutate({ extensions: [] });
      if (file) {
        const name = file.name || "local-file";
        const href = name.startsWith("file://") ? name : `file://${name}`;
        return { href, title: name };
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[note-link-bridge] pickLocalFile failed:", e);
    }
    return null;
  };

  storage.openLink = (href: string, _newTab: boolean): void => {
    if (isInternalLink(href)) {
      const parsed = parseInternalLink(href);
      if (parsed?.type === "note") {
        const layout = useEditorLayoutStore();
        // v1: open the target note in a new tab in this pane's group. The
        // `blockId` (section link) is intentionally NOT scrolled-to yet — that
        // needs a block-scroll mechanism in the opened editor (follow-up).
        layout.openTab(getGroupId(), parsed.id);
        return;
      }
    }
    if (href.startsWith("file://") || href.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(href)) {
      let rawPath = href;
      if (href.startsWith("file://")) {
        try {
          rawPath = decodeURIComponent(href.slice(7));
        } catch {
          rawPath = href.slice(7);
        }
      }
      void desktop.shell.openPath.mutate({ path: rawPath });
      return;
    }
    // External link → OS browser. `noopener` matches the mark's `rel`.
    window.open(href, "_blank", "noopener,noreferrer");
  };

  // --- Load/promote reconcile: ensure relations exist for inline links -------
  // Adds a `note`→`note` relation for every inline `nn://note/<id>` in the doc
  // that doesn't already have one (idempotent — `db.relations.add` is unique by
  // pair), then reloads the per-pane footer once. Called after `setContent`
  // (load) and on draft→promote. Skips self-links.
  async function syncNoteLinks(): Promise<void> {
    if (editor.isDestroyed) return;
    const noteId = getNoteId();
    if (!noteId) return;
    const inlineIds = collectNoteLinkIds(editor.state.doc).filter((id) => id !== noteId);
    const existing = new Set(footer.outgoing.value.map((l) => l.id));
    const missing = inlineIds.filter((id) => !existing.has(id));
    if (missing.length === 0) return;
    const db = getDatabase();
    for (const id of missing) {
      try {
        await db.relations.add({ id: noteId, type: "note" }, { id, type: "note" });
      } catch {
        /* idempotent / relation type unsupported — ignore */
      }
    }
    await footer.reload();
  }
  storage.syncNoteLinks = syncNoteLinks;

  // --- Live edit sync: inline link added/removed → relation added/removed ---
  // Diff the inline note-link id set before/after each transaction; for ids
  // that changed in a USER transaction (not a programmatic load via
  // `preventUpdate`), call `footer.link`/`footer.unlink` (id-aware DB write +
  // per-pane reload). `prevLinkedIds` updates on every transaction (including
  // programmatic) so the diff stays correct after loads.
  let prevLinkedIds = collectNoteLinkIds(editor.state.doc);
  const onTransaction = ({ transaction: tr }: { transaction: Transaction }): void => {
    if (!tr.docChanged) return;
    const programmatic = tr.getMeta("preventUpdate") === true;
    const next = collectNoteLinkIds(editor.state.doc);
    const added = addedNoteLinkIds(prevLinkedIds, next);
    const removed = removedNoteLinkIds(prevLinkedIds, next);
    prevLinkedIds = next;
    if (programmatic) return;
    const noteId = getNoteId();
    if (!noteId) return;
    for (const id of added) if (id !== noteId) void footer.link(id);
    for (const id of removed) if (id !== noteId) void footer.unlink(id);
  };
  editor.on("transaction", onTransaction);

  // Draft→promote: when the note id resolves (was null, now set), the doc may
  // already contain inline links from the draft — seed their relations.
  const stop = watch(
    () => getNoteId(),
    (id, prev) => {
      if (id && !prev) void syncNoteLinks();
    }
  );

  return () => {
    editor.off("transaction", onTransaction);
    stop();
  };
}