// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useNotesStore } from "@/stores/notes";
import type { NoteListItem } from "@/stores/notes";
import { EV, EVENTS } from "@notesnook-vue/contracts";

/** In-memory note store backing `db.notes.note` / `db.notes.all.items`. A note
 *  absent from the map → `note()` returns undefined (mirrors core, which
 *  returns undefined for deleted/trashed). `archived:true` notes are returned
 *  by `note()` but excluded by `all.items()` (mirrors core's `notes.all`
 *  filtering `isFalse("archived")` while `notes.note` does NOT). */
const notesById = new Map<string, Record<string, unknown>>();

const db = {
  notes: {
    note: vi.fn(async (id: string) => notesById.get(id)),
    all: {
      items: vi.fn(
        async () =>
          Array.from(notesById.values()).filter(
            (n) => !n.deleted && !n.archived
          )
      )
    }
  },
  content: { findByNoteId: vi.fn(async () => ({ data: "<p>hi</p>" })) },
  relations: { to: vi.fn(() => ({ resolve: vi.fn(async () => []) })) },
  monographs: {
    refresh: vi.fn(async () => {}),
    all: { ids: vi.fn(async () => []) }
  }
};

vi.mock("@/platform/bootstrap", () => ({
  getCurrentContext: () => "local",
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

// `loadPreview` calls `queueIndexNoteEmbeddings` — stub the (heavy) vector-search
// module so the test stays a pure store-logic test.
vi.mock("@/utils/vector-search", () => ({
  queueIndexNoteEmbeddings: vi.fn(),
  deleteNoteEmbeddings: vi.fn()
}));

function listItem(
  p: Partial<NoteListItem> & Pick<NoteListItem, "id">
): NoteListItem {
  return {
    id: p.id,
    title: p.title ?? "Untitled",
    headline: p.headline ?? "",
    dateCreated: p.dateCreated ?? 0,
    dateEdited: p.dateEdited ?? 0,
    tags: p.tags ?? [],
    pinned: p.pinned ?? false,
    favorite: p.favorite ?? false
  };
}

function dbNote(p: {
  id: string;
  title?: string;
  headline?: string;
  dateEdited?: number;
  dateCreated?: number;
  pinned?: boolean;
  favorite?: boolean;
  archived?: boolean;
}): Record<string, unknown> {
  return {
    id: p.id,
    type: "note",
    title: p.title ?? "Untitled",
    headline: p.headline ?? "",
    dateEdited: p.dateEdited ?? 100,
    dateCreated: p.dateCreated ?? 50,
    pinned: p.pinned ?? false,
    favorite: p.favorite ?? false,
    archived: p.archived ?? false
  };
}

describe("useNotesStore — incremental sync (applySyncedNotes)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    notesById.clear();
    db.notes.note.mockClear();
    db.notes.all.items.mockClear();
    db.content.findByNoteId.mockClear();
    db.relations.to.mockClear();
    db.monographs.refresh.mockClear();
    db.monographs.all.ids.mockClear();
  });

  it("is a no-op for an empty id list (no fetch, no list mutation)", async () => {
    const notes = useNotesStore();
    notes.items = [listItem({ id: "a", title: "A" })];
    await notes.applySyncedNotes([]);
    expect(db.notes.note).not.toHaveBeenCalled();
    expect(notes.items.map((n) => n.id)).toEqual(["a"]);
  });

  it("patches an existing row in place (identity preserved, scalars updated)", async () => {
    const notes = useNotesStore();
    notes.items = [
      listItem({
        id: "a",
        title: "Old",
        headline: "old",
        dateEdited: 10,
        pinned: false,
        favorite: false,
        tags: ["work"]
      })
    ];
    // Capture the reactive proxy AFTER it lands in the store — the in-place
    // patch must mutate this same proxy (not replace the array) so Vue reuses
    // the DOM node and doesn't re-render the row.
    const rowProxy = notes.items[0];
    notesById.set(
      "a",
      dbNote({
        id: "a",
        title: "New title",
        headline: "new headline",
        dateEdited: 999,
        pinned: true,
        favorite: true
      })
    );
    await notes.applySyncedNotes(["a"]);
    expect(notes.items[0]).toBe(rowProxy);
    expect(notes.items[0].title).toBe("New title");
    expect(notes.items[0].headline).toBe("new headline");
    expect(notes.items[0].dateEdited).toBe(999);
    expect(notes.items[0].pinned).toBe(true);
    expect(notes.items[0].favorite).toBe(true);
  });

  it("inserts a newly-pulled note not already in the list", async () => {
    const notes = useNotesStore();
    notes.items = [listItem({ id: "a", title: "A" })];
    notesById.set(
      "b",
      dbNote({ id: "b", title: "Brand new", dateEdited: 5 })
    );
    await notes.applySyncedNotes(["b"]);
    expect(notes.items.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(notes.items.find((n) => n.id === "b")?.title).toBe("Brand new");
  });

  it("removes a note the sync deleted (`db.notes.note` returns undefined)", async () => {
    const notes = useNotesStore();
    notes.items = [
      listItem({ id: "a", title: "A" }),
      listItem({ id: "b", title: "B" })
    ];
    // "a" is gone from the db (deleted/trashed remotely) → note() returns undefined.
    notesById.set("b", dbNote({ id: "b", title: "B" }));
    await notes.applySyncedNotes(["a"]);
    expect(notes.items.map((n) => n.id)).toEqual(["b"]);
  });

  it("removes a note the sync archived (note() returns it, but archived:true)", async () => {
    const notes = useNotesStore();
    notes.items = [listItem({ id: "a", title: "A" })];
    // `notes.note` does NOT filter archived (only `notes.all` does) — so the
    // store must check `archived` itself to drop it from the list.
    notesById.set("a", dbNote({ id: "a", title: "A", archived: true }));
    await notes.applySyncedNotes(["a"]);
    expect(notes.items.map((n) => n.id)).toEqual([]);
  });

  it("falls back to a full load() when more than the incremental cap changed", async () => {
    const notes = useNotesStore();
    notes.items = [listItem({ id: "keep", title: "Keep" })];
    // Bulk pull: 33 notes (> SYNC_INCREMENTAL_MAX=32) → full load instead of
    // 33 serialized `note()` round-trips.
    for (let i = 0; i < 33; i++) {
      notesById.set(`n${i}`, dbNote({ id: `n${i}`, title: `N${i}` }));
    }
    notesById.set("keep", dbNote({ id: "keep", title: "Keep" }));
    const ids = Array.from({ length: 33 }, (_, i) => `n${i}`);
    await notes.applySyncedNotes(ids);
    // Full load path: `all.items()` used, per-id `note()` NOT called.
    expect(db.notes.all.items).toHaveBeenCalled();
    expect(db.notes.note).not.toHaveBeenCalled();
    // `all.items()` excludes nothing here (none deleted/archived) → 34 rows.
    expect(notes.items.map((n) => n.id)).toContain("keep");
    expect(notes.items.length).toBe(34);
  });

  it("refreshes publish ids after an incremental apply", async () => {
    const notes = useNotesStore();
    notes.items = [listItem({ id: "a", title: "A" })];
    notesById.set("a", dbNote({ id: "a", title: "A" }));
    await notes.applySyncedNotes(["a"]);
    expect(db.monographs.refresh).toHaveBeenCalled();
    expect(db.monographs.all.ids).toHaveBeenCalled();
  });
});

describe("useNotesStore — syncItemMerged accumulation + drain", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    db.notes.note.mockClear();
  });

  it("drainSyncMergedNoteIds is empty before any sync event", () => {
    const notes = useNotesStore();
    expect(notes.drainSyncMergedNoteIds()).toEqual([]);
  });

  it("accumulates note + content item ids and drains them (clearing the set)", async () => {
    const notes = useNotesStore();
    notes.bindSyncEvents();
    // A `note` item: payload.id is the note id.
    EV.publish(EVENTS.syncItemMerged, { id: "n1", type: "note", title: "N1" });
    // A `content` item: payload.noteId is the owning note id.
    EV.publish(EVENTS.syncItemMerged, {
      id: "c1",
      type: "tiptap",
      noteId: "n2",
      dateEdited: 5
    });
    // A deleted note item: DeletedItem { id, deleted:true } (no type/noteId).
    EV.publish(EVENTS.syncItemMerged, { id: "n3", deleted: true });
    // A deleted *content* item carrying a `deleted` flag + `noteId` — must map
    // to the owning note id (n4), not the content id (c2).
    EV.publish(EVENTS.syncItemMerged, {
      id: "c2",
      type: "tiptap",
      noteId: "n4",
      deleted: true
    });
    const drained = notes.drainSyncMergedNoteIds().sort();
    expect(drained).toEqual(["n1", "n2", "n3", "n4"]);
    // Drain clears → a second drain is empty.
    expect(notes.drainSyncMergedNoteIds()).toEqual([]);
  });

  it("ignores payloads without a usable id", async () => {
    const notes = useNotesStore();
    notes.bindSyncEvents();
    EV.publish(EVENTS.syncItemMerged, undefined);
    EV.publish(EVENTS.syncItemMerged, { type: "tiptap", noteId: 123 as unknown as string });
    expect(notes.drainSyncMergedNoteIds()).toEqual([]);
  });
});