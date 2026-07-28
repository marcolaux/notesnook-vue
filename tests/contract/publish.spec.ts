// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  buildPublishOptions,
  formatPublishUrl,
  type PublishOptions
} from "@/utils/publish";
import { usePublishStore } from "@/stores/publish";
import { useNotesStore } from "@/stores/notes";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import type { Monograph, Note } from "@notesnook-vue/contracts";

// In-memory fake db: a Set of published noteIds + a Map of persisted Monograph
// rows backs `monographs.refresh/isPublished/publish/unpublish/get`; the notes
// map backs `notes.note` + `notes.all.items` (the list reload after a publish).
// Avoids the platform graph.
type FakeNote = Pick<Note, "id" | "title" | "headline" | "dateCreated" | "dateEdited" | "tags" | "pinned" | "favorite" | "readonly" | "localOnly">;

const db = {
  _full: new Map<string, FakeNote>(),
  _published: new Set<string>(),
  _monographs: new Map<string, Monograph>(),
  notes: {
    note: vi.fn(async (id: string) => db._full.get(id)),
    all: { items: vi.fn(async () => Array.from(db._full.values())) }
  },
  // Stubs the notes store touches during `load()` (loadPreview/loadTags) so it
  // logs nothing — not exercised here, just kept quiet.
  content: { findByNoteId: vi.fn(async () => null) },
  relations: {
    to: vi.fn(() => ({ resolve: vi.fn(async () => []) }))
  },
  monographs: {
    refresh: vi.fn(async () => {
      /* repopulate cache from local DB — here the set IS the cache */
    }),
    isPublished: vi.fn((id: string) => db._published.has(id)),
    // `notes.load()` → `loadPublishedIds()` reads `all.ids()` for the list's
    // published globe icon. Stubbed empty so it logs nothing during the
    // publish-store tests (which exercise publish/unpublish, not the set).
    all: { ids: vi.fn(async () => Array.from(db._published.keys())) },
    publish: vi.fn(async (id: string, title: string, opts: PublishOptions) => {
      db._published.add(id);
      const m = {
        id,
        type: "monograph" as const,
        title,
        datePublished: 200,
        dateCreated: 200,
        dateModified: 200,
        selfDestruct: !!opts.selfDestruct,
        publishUrl: `https://monogr.ph/${id}`
      } as Monograph;
      db._monographs.set(id, m);
      return id;
    }),
    unpublish: vi.fn(async (id: string) => {
      db._published.delete(id);
      db._monographs.delete(id);
    }),
    get: vi.fn(async (id: string) => db._monographs.get(id))
  },
  // `publishById` runs a "send" sync before `db.monographs.publish` to upload
  // pending image attachments to the server (otherwise the public page can't
  // resolve `<img data-hash>` against S3). Stubbed so the call is observable.
  sync: vi.fn(async () => true)
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

describe("buildPublishOptions", () => {
  it("omits undefined fields (exactOptionalPropertyTypes-safe)", () => {
    expect(buildPublishOptions()).toEqual({});
    expect(buildPublishOptions({})).toEqual({});
  });

  it("includes password only when provided", () => {
    expect(buildPublishOptions({ password: "pw" })).toEqual({ password: "pw" });
  });

  it("includes selfDestruct only when provided", () => {
    expect(buildPublishOptions({ selfDestruct: true })).toEqual({ selfDestruct: true });
  });

  it("includes both when provided", () => {
    expect(buildPublishOptions({ password: "pw", selfDestruct: true })).toEqual({
      password: "pw",
      selfDestruct: true
    });
  });
});

describe("formatPublishUrl", () => {
  it("returns the monograph publishUrl", () => {
    const m = { publishUrl: "https://monogr.ph/abc" } as Monograph;
    expect(formatPublishUrl(m)).toBe("https://monogr.ph/abc");
  });

  it("returns empty string for an unknown / unpublished monograph", () => {
    expect(formatPublishUrl(undefined)).toBe("");
    const m = {} as Monograph;
    expect(formatPublishUrl(m)).toBe("");
  });
});

describe("usePublishStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    db._full.clear();
    db._published.clear();
    db._monographs.clear();
    db.notes.note.mockClear();
    db.notes.all.items.mockClear();
    db.monographs.refresh.mockClear();
    db.monographs.isPublished.mockClear();
    db.monographs.publish.mockClear();
    db.monographs.unpublish.mockClear();
    db.monographs.get.mockClear();
    db.sync.mockClear();
  });

  it("no active note → unpublished + empty url", async () => {
    const layout = useEditorLayoutStore();
    layout.init();
    useNotesStore();
    const pub = usePublishStore();
    await pub.refresh();
    expect(pub.activeNoteId).toBeNull();
    expect(pub.published).toBe(false);
    expect(pub.publishUrl).toBe("");
    expect(pub.datePublished).toBe(0);
  });

  it("refresh reloads publish state for an unpublished note", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    const pub = usePublishStore();
    await pub.refresh();
    expect(db.monographs.refresh).toHaveBeenCalled();
    expect(db.monographs.isPublished).toHaveBeenCalledWith("a");
    expect(pub.published).toBe(false);
    expect(pub.publishUrl).toBe("");
  });

  it("refresh reads url + date for a published note", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db._published.add("a");
    db._monographs.set(
      "a",
      { id: "a", type: "monograph", title: "A", datePublished: 200, dateCreated: 200, dateModified: 200, selfDestruct: false, publishUrl: "https://monogr.ph/a" } as Monograph
    );
    const pub = usePublishStore();
    await pub.refresh();
    expect(pub.published).toBe(true);
    expect(pub.publishUrl).toBe("https://monogr.ph/a");
    expect(pub.datePublished).toBe(200);
  });

  it("publish calls db.monographs.publish(id, title, opts) + reloads + returns true", async () => {
    await openNote(fakeNote({ id: "a", title: "My note" }));
    const pub = usePublishStore();
    const ok = await pub.publish(undefined, { selfDestruct: true });
    expect(ok).toBe(true);
    expect(db.monographs.publish).toHaveBeenCalledWith("a", "My note", { selfDestruct: true });
    expect(pub.published).toBe(true);
    expect(pub.publishUrl).toBe("https://monogr.ph/a");
    expect(pub.publishing).toBe(false);
    expect(pub.lastError).toBeNull();
    expect(db.notes.all.items).toHaveBeenCalled();
  });

  it("publish uses the explicit title when given", async () => {
    await openNote(fakeNote({ id: "a", title: "List title" }));
    const pub = usePublishStore();
    await pub.publish("Explicit");
    expect(db.monographs.publish).toHaveBeenCalledWith("a", "Explicit", {});
  });

  it("publish returns false + sets lastError when db.monographs.publish throws", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db.monographs.publish.mockRejectedValueOnce(new Error("Please login to publish a note."));
    const pub = usePublishStore();
    const ok = await pub.publish("A");
    expect(ok).toBe(false);
    expect(pub.lastError).toBe("Please login to publish a note.");
    expect(pub.publishing).toBe(false);
  });

  it("publish returns false with no active note (db not called)", async () => {
    setActivePinia(createPinia());
    useEditorLayoutStore().init();
    useNotesStore();
    const pub = usePublishStore();
    expect(await pub.publish("A")).toBe(false);
    expect(db.monographs.publish).not.toHaveBeenCalled();
  });

  it("unpublish calls db.monographs.unpublish(id) + clears state + returns true", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db._published.add("a");
    db._monographs.set("a", { id: "a", type: "monograph", title: "A", datePublished: 200, dateCreated: 200, dateModified: 200, selfDestruct: false, publishUrl: "u" } as Monograph);
    const pub = usePublishStore();
    await pub.refresh();
    expect(pub.published).toBe(true);
    const ok = await pub.unpublish();
    expect(ok).toBe(true);
    expect(db.monographs.unpublish).toHaveBeenCalledWith("a");
    expect(pub.published).toBe(false);
    expect(pub.publishUrl).toBe("");
    expect(pub.lastError).toBeNull();
  });

  it("unpublish returns false + sets lastError when db.monographs.unpublish throws", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db.monographs.unpublish.mockRejectedValueOnce(new Error("network down"));
    const pub = usePublishStore();
    const ok = await pub.unpublish();
    expect(ok).toBe(false);
    expect(pub.lastError).toBe("network down");
    expect(pub.publishing).toBe(false);
  });

  it("unpublish returns false with no active note", async () => {
    setActivePinia(createPinia());
    useEditorLayoutStore().init();
    useNotesStore();
    const pub = usePublishStore();
    expect(await pub.unpublish()).toBe(false);
    expect(db.monographs.unpublish).not.toHaveBeenCalled();
  });

  it("active-note switch reseeds publish state", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db._published.add("a");
    db._monographs.set("a", { id: "a", type: "monograph", title: "A", datePublished: 200, dateCreated: 200, dateModified: 200, selfDestruct: false, publishUrl: "ua" } as Monograph);
    const pub = usePublishStore();
    await pub.refresh();
    expect(pub.published).toBe(true);
    // switch to an unpublished note
    await openNote(fakeNote({ id: "b", title: "B" }));
    await pub.refresh();
    expect(pub.published).toBe(false);
    expect(pub.publishUrl).toBe("");
  });

  it("publishById publishes the active note + reseeds its state", async () => {
    await openNote(fakeNote({ id: "a", title: "My note" }));
    const pub = usePublishStore();
    const ok = await pub.publishById("a", undefined, { selfDestruct: true });
    expect(ok).toBe(true);
    // title defaults to the active note's title when undefined.
    expect(db.monographs.publish).toHaveBeenCalledWith("a", "My note", { selfDestruct: true });
    expect(pub.published).toBe(true);
    expect(pub.publishUrl).toBe("https://monogr.ph/a");
    expect(db.notes.all.items).toHaveBeenCalled();
  });

  it("publishById publishes a non-active note (uses given title, no reseed)", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    const pub = usePublishStore();
    // "b" is NOT the active note — publish it by explicit id + title.
    const ok = await pub.publishById("b", "B title", { password: "pw" });
    expect(ok).toBe(true);
    expect(db.monographs.publish).toHaveBeenCalledWith("b", "B title", { password: "pw" });
    expect(db._published.has("b")).toBe(true);
    // The active note is still "a" (unpublished) → its state is NOT reseeded.
    expect(pub.published).toBe(false);
    expect(pub.publishUrl).toBe("");
    // The notes list is still reloaded.
    expect(db.notes.all.items).toHaveBeenCalled();
  });

  it("publishById returns false + sets lastError when publish throws", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db.monographs.publish.mockRejectedValueOnce(new Error("locked notes cannot be published"));
    const pub = usePublishStore();
    const ok = await pub.publishById("a", "A");
    expect(ok).toBe(false);
    expect(pub.lastError).toBe("locked notes cannot be published");
    expect(pub.publishing).toBe(false);
  });

  it("publishById uploads pending attachments via a 'send' sync before publishing", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    const pub = usePublishStore();
    const ok = await pub.publishById("a", "A");
    expect(ok).toBe(true);
    // A "send" sync (uploads pending attachments, does not pull) runs before
    // the publish call so image blobs are on the server when the public page
    // resolves `<img data-hash>` against S3.
    expect(db.sync).toHaveBeenCalledWith({ type: "send" });
    const syncOrder = db.sync.mock.invocationCallOrder[0];
    const publishOrder = db.monographs.publish.mock.invocationCallOrder[0];
    expect(syncOrder).toBeLessThan(publishOrder);
  });

  it("publishById still succeeds when the pre-publish send-sync throws (upload failure is non-blocking)", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db.sync.mockRejectedValueOnce(new Error("offline"));
    const pub = usePublishStore();
    const ok = await pub.publishById("a", "A");
    // Publish proceeds regardless — its own auth/server error surfaces via
    // lastError; a sync failure is swallowed (logged) so the user still gets a
    // URL (they can re-publish after a successful sync).
    expect(ok).toBe(true);
    expect(db.monographs.publish).toHaveBeenCalledWith("a", "A", {});
    expect(pub.lastError).toBeNull();
  });

  it("unpublishById unpublishes an explicit id + reseeds only when it is the active note", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db._published.add("a");
    db._monographs.set("a", { id: "a", type: "monograph", title: "A", datePublished: 200, dateCreated: 200, dateModified: 200, selfDestruct: false, publishUrl: "ua" } as Monograph);
    const pub = usePublishStore();
    await pub.refresh();
    expect(pub.published).toBe(true);
    const ok = await pub.unpublishById("a");
    expect(ok).toBe(true);
    expect(db.monographs.unpublish).toHaveBeenCalledWith("a");
    expect(pub.published).toBe(false);
    expect(pub.publishUrl).toBe("");
  });

  it("unpublishById unpublishes a non-active note without reseeding the active note's state", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db._published.add("a");
    db._monographs.set("a", { id: "a", type: "monograph", title: "A", datePublished: 200, dateCreated: 200, dateModified: 200, selfDestruct: false, publishUrl: "ua" } as Monograph);
    const pub = usePublishStore();
    await pub.refresh();
    expect(pub.published).toBe(true);
    // Unpublish "b" (NOT the active note).
    const ok = await pub.unpublishById("b");
    expect(ok).toBe(true);
    expect(db.monographs.unpublish).toHaveBeenCalledWith("b");
    // The active note "a" is still published — its state is untouched.
    expect(pub.published).toBe(true);
    expect(pub.publishUrl).toBe("ua");
  });
});