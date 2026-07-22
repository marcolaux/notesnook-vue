// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useNotesStore } from "@/stores/notes";
import { useEditorLayoutStore } from "@/stores/editor-layout";

// In-memory db stub so `createDraft`/`create` can run without the platform
// graph. `add` records its full arg (title + content) so the draft test can
// assert the note is seeded with the user's in-flight text.
const adds: Array<Record<string, unknown>> = [];
const db = {
  notes: {
    _store: new Map<string, { id: string; title: string; content?: unknown }>(),
    add: vi.fn(async (arg: Record<string, unknown>) => {
      adds.push(arg);
      const id = `n-${db.notes._store.size + 1}`;
      db.notes._store.set(id, {
        id,
        title: (arg.title as string) ?? "",
        content: arg.content
      });
      return id;
    }),
    all: {
      items: vi.fn(async () =>
        Array.from(db.notes._store.values()).map((e) => ({
          id: e.id,
          title: e.title,
          headline: "",
          dateCreated: 0,
          dateEdited: 0,
          pinned: false,
          favorite: false,
          tags: []
        }))
      )
    }
  },
  content: { findByNoteId: vi.fn(async () => null) }
};
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

const { notifyChangedMutate } = vi.hoisted(() => ({ notifyChangedMutate: vi.fn() }));
vi.mock("@/platform/desktop-bridge", () => ({
  desktop: { window: { notifyNoteChanged: { mutate: notifyChangedMutate } } }
}));

describe("notes draft — lazy create on first keystroke (per-tab model)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    db.notes._store.clear();
    adds.length = 0;
    db.notes.add.mockClear();
    db.notes.all.items.mockClear();
    notifyChangedMutate.mockClear();
  });

  it("starts in the empty state: no active note, no tabs", () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    expect(notes.activeNote).toBeNull();
    expect(notes.activeTabId).toBeNull();
  });

  it("createDraft seeds title + content, opens a tab in the group, pre-seeds the cache", async () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    const groupId = layout.activeGroupId;

    const id = await notes.createDraft({ title: "", content: "<p>H</p>" }, groupId);

    expect(id).toBe("n-1");
    expect(adds).toHaveLength(1);
    expect(adds[0]).toMatchObject({
      title: "",
      content: { type: "tiptap", data: "<p>H</p>" }
    });
    expect(notes.activeNote?.id).toBe("n-1");
    expect(layout.activeTab?.noteId).toBe("n-1");
    // The content cache is pre-seeded with the user's exact text so the new
    // tab's Editor reads it without a DB round-trip race.
    expect(notes.getContent("n-1")?.html).toBe("<p>H</p>");
    expect(notes.getContent("n-1")?.state).toBe("loaded");
  });

  it("createDraft re-seeds the cache from getLatestContent (preserves await-window typing)", async () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    // opts.content is the PRE-await snapshot ("<p>H</p>"); getLatestContent
    // returns the LATER html the user typed during the db.add/load await
    // window. The cache must be seeded with the LATEST, not the snapshot, or
    // the new tab would load the snapshot and the await-window text would be
    // lost when the draft editor unmounts.
    const id = await notes.createDraft(
      { title: "", content: "<p>H</p>" },
      layout.activeGroupId,
      "title",
      () => "<p>Hello</p>"
    );
    expect(id).toBe("n-1");
    expect(notes.getContent("n-1")?.html).toBe("<p>Hello</p>");
    expect(notes.getContent("n-1")?.state).toBe("loaded");
  });

  it("createDraft with only a title seeds the title and no content", async () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    const id = await notes.createDraft({ title: "Hello" }, layout.activeGroupId);
    expect(id).toBe("n-1");
    expect(adds[0]).toMatchObject({ title: "Hello" });
    expect(adds[0]).not.toHaveProperty("content");
    expect(notes.activeNote?.title).toBe("Hello");
    // Cache seeded with empty html (no content provided).
    expect(notes.getContent("n-1")?.html).toBe("");
  });

  it("createDraft returns null on db failure (editor keeps its text)", async () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    db.notes.add.mockRejectedValueOnce(new Error("disk full"));
    const id = await notes.createDraft({ title: "x", content: "<p>x</p>" }, layout.activeGroupId);
    expect(id).toBeNull();
    expect(notes.activeNote).toBeNull();
  });

  it("createDraft opens the tab in the passed group (not necessarily the active one)", async () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    // Split: a second group is created and focused.
    const second = layout.splitGroup("vertical");
    expect(layout.activeGroupId).toBe(second);
    // Draft into the ORIGINAL (now non-active) group.
    const root = Object.keys(layout.groups).find((g) => g !== second)!;
    const id = await notes.createDraft({ title: "", content: "<p>H</p>" }, root);
    expect(id).toBe("n-1");
    // The tab lives in the original group, which is now the active one (openTab
    // activates the group it opens in).
    expect(layout.activeGroupId).toBe(root);
    expect(layout.tabsOf(root).map((t) => t.noteId)).toEqual(["n-1"]);
    expect(layout.tabsOf(second)).toEqual([]);
    expect(notes.activeNote?.id).toBe("n-1");
  });

  it("create() (the + button) opens in the active group + focuses title", async () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    await notes.create();
    expect(notes.activeNote?.id).toBe("n-1");
    expect(layout.activeTab?.noteId).toBe("n-1");
    // "select" mode: focus + select-all over the title so the user can
    // quickly rename it. (Core generates the title from the user's
    // `titleFormat` setting; the in-memory stub here leaves it empty, which
    // the test doesn't assert on.)
    expect(notes.pendingTitleFocus).toBe("select");
  });

  it("createDraft() requests caret-at-end title focus (preserves typed letter)", async () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    await notes.createDraft({ title: "H", content: "<p>H</p>" }, layout.activeGroupId);
    expect(notes.activeNote?.id).toBe("n-1");
    // Default focus="title" → "end" mode: focus + caret after the just-typed
    // letter (NOT select-all, which would let the next keystroke clobber it).
    expect(notes.pendingTitleFocus).toBe("end");
    expect(notes.pendingBodyFocus).toBe(false);
  });

  it("createDraft({focus:'body'}) requests body focus (keeps typing in the body)", async () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    await notes.createDraft(
      { title: "", content: "<p>H</p>" },
      layout.activeGroupId,
      "body"
    );
    expect(notes.activeNote?.id).toBe("n-1");
    // A body keystroke keeps focus in the body — do NOT yank it to the title.
    expect(notes.pendingBodyFocus).toBe(true);
    expect(notes.pendingTitleFocus).toBeNull();
  });

  it("resetView closes all tabs + clears the content cache", async () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    await notes.createDraft({ title: "", content: "<p>H</p>" }, layout.activeGroupId);
    expect(notes.activeNote?.id).toBe("n-1");

    notes.resetView();
    expect(notes.activeNote).toBeNull();
    expect(Object.keys(layout.tabs)).toHaveLength(0);
    expect(notes.contentCache).toEqual({});
  });
});