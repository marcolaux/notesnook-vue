// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useMonographsStore } from "@/stores/monographs";
import { useNotesStore } from "@/stores/notes";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import type { Monograph, Note } from "@notesnook-vue/contracts";

/** A minimal Note shape — the store reads id/title/headline/dateEdited. */
type FakeNote = Pick<
  Note,
  "id" | "title" | "headline" | "dateCreated" | "dateEdited" | "tags" | "pinned" | "favorite" | "readonly" | "localOnly"
>;

const db = {
  _full: new Map<string, FakeNote>(),
  _published: new Set<string>(),
  _monographs: new Map<string, Monograph>(),
  _views: new Map<string, number>(),
  notes: {
    note: vi.fn(async (id: string) => db._full.get(id)),
    all: { items: vi.fn(async () => Array.from(db._full.values())) }
  },
  // Stubs the notes store touches during `load()` enrichment so it logs
  // nothing — not exercised here, just kept quiet (mirrors publish.spec.ts).
  content: { findByNoteId: vi.fn(async () => null) },
  relations: {
    to: vi.fn(() => ({ resolve: vi.fn(async () => []) }))
  },
  monographs: {
    refresh: vi.fn(async () => {
      /* repopulate cache from local DB — here the set IS the cache */
    }),
    isPublished: vi.fn((id: string) => db._published.has(id)),
    all: {
      // `db.monographs.all` is a FilterSelector<Note> over published note ids.
      items: vi.fn(async () =>
        Array.from(db._full.values()).filter((n) => db._published.has(n.id))
      ),
      // `notes.load()` → `loadPublishedIds()` reads `all.ids()` for the list
      // globe icon. Mirrors `items` (same published filter).
      ids: vi.fn(async () =>
        Array.from(db._full.values()).filter((n) => db._published.has(n.id)).map((n) => n.id)
      )
    },
    get: vi.fn(async (id: string) => db._monographs.get(id)),
    metadata: vi.fn(async (id: string) => ({
      publishUrl: db._monographs.get(id)?.publishUrl ?? "",
      analytics: { totalViews: db._views.get(id) ?? 0 }
    })),
    unpublish: vi.fn(async (id: string) => {
      db._published.delete(id);
      db._monographs.delete(id);
    })
  }
};

vi.mock("@/platform/bootstrap", () => ({
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

function publish(noteId: string, title: string, opts: { selfDestruct?: boolean; url?: string } = {}): void {
  db._full.set(noteId, fakeNote({ id: noteId, title, headline: `preview-${noteId}`, dateEdited: 500, dateCreated: 400 }));
  db._published.add(noteId);
  db._monographs.set(
    noteId,
    {
      id: noteId,
      type: "monograph",
      title,
      datePublished: 200,
      dateCreated: 200,
      dateModified: 200,
      selfDestruct: !!opts.selfDestruct,
      publishUrl: opts.url ?? `https://monogr.ph/${noteId}`
    } as Monograph
  );
}

describe("useMonographsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    db._full.clear();
    db._published.clear();
    db._monographs.clear();
    db._views.clear();
    db.notes.note.mockClear();
    db.notes.all.items.mockClear();
    db.monographs.refresh.mockClear();
    db.monographs.isPublished.mockClear();
    db.monographs.all.items.mockClear();
    db.monographs.get.mockClear();
    db.monographs.metadata.mockClear();
    db.monographs.unpublish.mockClear();
  });

  it("starts empty", () => {
    const m = useMonographsStore();
    expect(m.items).toEqual([]);
    expect(m.count).toBe(0);
  });

  it("load refreshes the cache first, then reads published notes + their monograph rows", async () => {
    publish("a", "A", { selfDestruct: true, url: "https://monogr.ph/a" });
    publish("b", "B");
    const m = useMonographsStore();
    await m.load();
    expect(db.monographs.refresh).toHaveBeenCalled();
    expect(db.monographs.all.items).toHaveBeenCalled();
    expect(db.monographs.get).toHaveBeenCalledWith("a");
    expect(db.monographs.get).toHaveBeenCalledWith("b");
    expect(m.items).toHaveLength(2);
    const a = m.items.find((i) => i.id === "a");
    expect(a).toMatchObject({
      id: "a",
      title: "A",
      headline: "preview-a",
      dateEdited: 500,
      datePublished: 200,
      publishUrl: "https://monogr.ph/a",
      selfDestruct: true
    });
    expect(m.count).toBe(2);
  });

  it("load applies the Untitled fallback for an empty title", async () => {
    publish("a", "");
    const m = useMonographsStore();
    await m.load();
    expect(m.items[0].title).toBe("Untitled");
  });

  it("load only lists published notes (filters via db.monographs.all)", async () => {
    publish("a", "A");
    db._full.set("b", fakeNote({ id: "b", title: "B (unpublished)" })); // not in _published
    const m = useMonographsStore();
    await m.load();
    expect(m.items.map((i) => i.id)).toEqual(["a"]);
  });

  it("loadAnalytics patches totalViews per row from db.monographs.metadata", async () => {
    publish("a", "A");
    publish("b", "B");
    db._views.set("a", 42);
    db._views.set("b", 7);
    const m = useMonographsStore();
    await m.load();
    await m.loadAnalytics();
    expect(db.monographs.metadata).toHaveBeenCalledWith("a");
    expect(db.monographs.metadata).toHaveBeenCalledWith("b");
    expect(m.items.find((i) => i.id === "a")?.totalViews).toBe(42);
    expect(m.items.find((i) => i.id === "b")?.totalViews).toBe(7);
  });

  it("metadata failure leaves totalViews undefined (list still renders)", async () => {
    publish("a", "A");
    // `load()` auto-fires `loadAnalytics()` (fire-and-forget) AND this test calls
    // it explicitly, so metadata is invoked twice — reject both so neither
    // patches `totalViews`.
    const down = new Error("network down");
    db.monographs.metadata.mockRejectedValueOnce(down);
    db.monographs.metadata.mockRejectedValueOnce(down);
    const m = useMonographsStore();
    await m.load();
    await m.loadAnalytics();
    expect(m.items.find((i) => i.id === "a")?.totalViews).toBeUndefined();
  });

  it("unpublish calls db.monographs.unpublish per id + reloads this list + notes", async () => {
    publish("a", "A");
    publish("b", "B");
    const m = useMonographsStore();
    await m.load();
    // init the notes store so `useNotesStore().load()` is callable.
    useEditorLayoutStore().init();
    useNotesStore();
    await m.unpublish(["a"]);
    expect(db.monographs.unpublish).toHaveBeenCalledWith("a");
    expect(db.monographs.unpublish).toHaveBeenCalledTimes(1);
    expect(m.items.map((i) => i.id)).toEqual(["b"]);
    expect(db.notes.all.items).toHaveBeenCalled();
  });

  it("unpublish with no ids is a no-op (no db call)", async () => {
    const m = useMonographsStore();
    await m.unpublish([]);
    expect(db.monographs.unpublish).not.toHaveBeenCalled();
  });

  it("load failure leaves the previous list intact (never throws)", async () => {
    publish("a", "A");
    const m = useMonographsStore();
    await m.load();
    expect(m.count).toBe(1);
    db.monographs.all.items.mockRejectedValueOnce(new Error("boom"));
    await expect(m.load()).resolves.toBeUndefined();
    expect(m.count).toBe(1); // unchanged
  });
});