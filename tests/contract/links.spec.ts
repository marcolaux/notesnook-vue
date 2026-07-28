// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useLinksStore } from "@/stores/links";
import { useNotesStore } from "@/stores/notes";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import type { Note } from "@notesnook-vue/contracts";

// In-memory fake db backing note→note relations. A single `_rels` array of
// `{from,to}` pairs backs `relations.from`/`to`/`add`/`unlink`; the notes
// themselves live in `_full` so `resolve()` can return full `Note` objects
// (the store maps them to `{id,title}` via `toLinkRef`). Avoids the platform
// graph — same shape as properties.spec.ts.
type Ref = { id: string; type: string };
type Rel = { from: Ref; to: Ref };
type FakeNote = Pick<Note, "id" | "title" | "headline" | "dateCreated" | "dateEdited" | "tags" | "pinned" | "favorite" | "readonly" | "localOnly">;

const db = {
  _full: new Map<string, FakeNote>(),
  _rels: [] as Rel[],
  notes: {
    all: { items: vi.fn(async () => Array.from(db._full.values())) }
  },
  relations: {
    from: vi.fn((ref: Ref, type: string) => ({
      resolve: vi.fn(async () =>
        db._rels
          .filter((r) => r.from.id === ref.id && r.from.type === ref.type && r.to.type === type)
          .map((r) => db._full.get(r.to.id))
          .filter((n): n is FakeNote => Boolean(n))
      )
    })),
    to: vi.fn((ref: Ref, type: string) => ({
      resolve: vi.fn(async () =>
        db._rels
          .filter((r) => r.to.id === ref.id && r.to.type === ref.type && r.from.type === type)
          .map((r) => db._full.get(r.from.id))
          .filter((n): n is FakeNote => Boolean(n))
      )
    })),
    add: vi.fn(async (from: Ref, to: Ref) => {
      if (from.type === "note" && to.type === "note") {
        const dup = db._rels.some(
          (r) => r.from.id === from.id && r.to.id === to.id
        );
        if (!dup) db._rels.push({ from, to });
      }
    }),
    unlink: vi.fn(async (from: Ref, to: Ref) => {
      db._rels = db._rels.filter(
        (r) => !(r.from.id === from.id && r.to.id === to.id)
      );
    })
  },
  content: { findByNoteId: vi.fn(async () => null) }
};
vi.mock("@/platform/bootstrap", () => ({
  getCurrentContext: () => "local",
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

function fakeNote(p: Partial<FakeNote> & Pick<FakeNote, "id" | "title">): FakeNote {
  return {
    id: p.id,
    title: p.title,
    headline: p.headline ?? "",
    dateCreated: p.dateCreated ?? 100,
    dateEdited: p.dateEdited ?? 100,
    tags: p.tags ?? [],
    pinned: p.pinned ?? false,
    favorite: p.favorite ?? false,
    readonly: p.readonly ?? false,
    localOnly: p.localOnly ?? false
  };
}

async function openNote(note: FakeNote): Promise<void> {
  db._full.set(note.id, note);
  const layout = useEditorLayoutStore();
  layout.init();
  const notes = useNotesStore();
  await notes.load();
  notes.selectNote(note.id);
}

describe("useLinksStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    db._full.clear();
    db._rels = [];
    db.relations.from.mockClear();
    db.relations.to.mockClear();
    db.relations.add.mockClear();
    db.relations.unlink.mockClear();
  });

  it("no active note → empty outgoing + incoming", async () => {
    setActivePinia(createPinia());
    const layout = useEditorLayoutStore();
    layout.init();
    useNotesStore(); // populate pinia (no items, no tab)
    const links = useLinksStore();
    await links.load();
    expect(links.outgoing).toEqual([]);
    expect(links.incoming).toEqual([]);
  });

  it("load reads outgoing via relations.from + incoming via relations.to", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db._full.set(fakeNote({ id: "b", title: "B" }).id, fakeNote({ id: "b", title: "B" }));
    db._full.set(fakeNote({ id: "c", title: "C" }).id, fakeNote({ id: "c", title: "C" }));
    // a → b (outgoing from a), c → a (incoming to a)
    db._rels.push(
      { from: { id: "a", type: "note" }, to: { id: "b", type: "note" } },
      { from: { id: "c", type: "note" }, to: { id: "a", type: "note" } }
    );

    const links = useLinksStore();
    await links.load();
    expect(db.relations.from).toHaveBeenCalledWith({ id: "a", type: "note" }, "note");
    expect(db.relations.to).toHaveBeenCalledWith({ id: "a", type: "note" }, "note");
    expect(links.outgoing).toEqual([{ id: "b", title: "B" }]);
    expect(links.incoming).toEqual([{ id: "c", title: "C" }]);
  });

  it("link adds an outgoing note→note relation (active → target), then reloads", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db._full.set(fakeNote({ id: "b", title: "B" }).id, fakeNote({ id: "b", title: "B" }));
    const links = useLinksStore();
    await links.load();

    const ok = await links.link("b");
    expect(ok).toBe(true);
    expect(db.relations.add).toHaveBeenCalledWith(
      { id: "a", type: "note" },
      { id: "b", type: "note" }
    );
    expect(links.outgoing).toEqual([{ id: "b", title: "B" }]);
  });

  it("link is a no-op for self-links", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    const links = useLinksStore();
    await links.load();

    const ok = await links.link("a");
    expect(ok).toBe(false);
    expect(db.relations.add).not.toHaveBeenCalled();
  });

  it("unlink removes the active → target relation, then reloads", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db._full.set(fakeNote({ id: "b", title: "B" }).id, fakeNote({ id: "b", title: "B" }));
    db._rels.push({ from: { id: "a", type: "note" }, to: { id: "b", type: "note" } });
    const links = useLinksStore();
    await links.load();
    expect(links.outgoing).toEqual([{ id: "b", title: "B" }]);

    const ok = await links.unlink("b");
    expect(ok).toBe(true);
    expect(db.relations.unlink).toHaveBeenCalledWith(
      { id: "a", type: "note" },
      { id: "b", type: "note" }
    );
    expect(links.outgoing).toEqual([]);
  });

  it("a link created from a shows up as incoming on b", async () => {
    // a links to b: outgoing on a, incoming on b. Seed both notes BEFORE
    // openNote so `notes.load()` populates `items` with both (activeNote is
    // resolved by finding the active tab's noteId in `items`).
    db._full.set(fakeNote({ id: "a", title: "A" }).id, fakeNote({ id: "a", title: "A" }));
    db._full.set(fakeNote({ id: "b", title: "B" }).id, fakeNote({ id: "b", title: "B" }));
    await openNote(fakeNote({ id: "a", title: "A" }));
    const linksA = useLinksStore();
    await linksA.load();
    await linksA.link("b");
    expect(linksA.outgoing).toEqual([{ id: "b", title: "B" }]);

    // Switch the active note to b and reload — a should appear as incoming.
    const notes = useNotesStore();
    notes.selectNote("b");
    await linksA.load();
    expect(linksA.incoming).toEqual([{ id: "a", title: "A" }]);
  });
});