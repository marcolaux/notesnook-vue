// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  sortHistoryByDateDesc,
  toHistoryEntry,
  type HistoryEntry
} from "@/utils/note-history";
import { useNoteHistoryStore } from "@/stores/note-history";
import { useNotesStore } from "@/stores/notes";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import type { HistorySession, Note } from "@notesnook-vue/contracts";

// In-memory fake db: a Map<noteId, HistorySession[]> backs
// `noteHistory.get(noteId).items(...)`; a Map<sessionId, content> backs
// `noteHistory.content(id)`; `restore(id)` flips a flag. The notes map backs
// `notes.note` + `notes.all.items`. Avoids the platform graph.
type FakeNote = Pick<Note, "id" | "title" | "headline" | "dateCreated" | "dateEdited" | "tags" | "pinned" | "favorite" | "readonly" | "localOnly">;

function fakeSession(p: { id: string; noteId: string; dateModified: number; locked?: boolean }): HistorySession {
  return {
    id: p.id,
    type: "session",
    noteId: p.noteId,
    sessionContentId: `sc-${p.id}`,
    dateCreated: p.dateModified,
    dateModified: p.dateModified,
    localOnly: false,
    locked: p.locked ?? false
  } as HistorySession;
}

const db = {
  _full: new Map<string, FakeNote>(),
  _sessions: new Map<string, HistorySession[]>(),
  _content: new Map<string, { data: string; type: "tiptap" }>(),
  _restored: vi.fn(),
  notes: {
    note: vi.fn(async (id: string) => db._full.get(id)),
    all: { items: vi.fn(async () => Array.from(db._full.values())) }
  },
  content: { findByNoteId: vi.fn(async () => null) },
  relations: { to: vi.fn(() => ({ resolve: vi.fn(async () => []) })) },
  noteHistory: {
    get: vi.fn((noteId: string) => ({
      items: vi.fn(async () => db._sessions.get(noteId) ?? [])
    })),
    content: vi.fn(async (sessionId: string) => db._content.get(sessionId)),
    restore: vi.fn(async (sessionId: string) => {
      db._restored.value = sessionId;
    })
  }
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

describe("toHistoryEntry + sortHistoryByDateDesc", () => {
  it("maps a HistorySession to the slim view", () => {
    const s = fakeSession({ id: "s1", noteId: "a", dateModified: 50, locked: true });
    expect(toHistoryEntry(s)).toEqual({ id: "s1", dateModified: 50, locked: true });
  });

  it("coerces locked to a boolean", () => {
    const s = fakeSession({ id: "s1", noteId: "a", dateModified: 50 });
    expect(toHistoryEntry(s).locked).toBe(false);
  });

  it("sorts newest-first by dateModified and does not mutate the input", () => {
    const entries: HistoryEntry[] = [
      { id: "old", dateModified: 10, locked: false },
      { id: "new", dateModified: 90, locked: false },
      { id: "mid", dateModified: 50, locked: true }
    ];
    const sorted = sortHistoryByDateDesc(entries);
    expect(sorted.map((e) => e.id)).toEqual(["new", "mid", "old"]);
    // input untouched
    expect(entries.map((e) => e.id)).toEqual(["old", "new", "mid"]);
  });
});

describe("useNoteHistoryStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    db._full.clear();
    db._sessions.clear();
    db._content.clear();
    db._restored = vi.fn();
    db.notes.note.mockClear();
    db.notes.all.items.mockClear();
    db.content.findByNoteId.mockClear();
    db.relations.to.mockClear();
    db.noteHistory.get.mockClear();
    db.noteHistory.content.mockClear();
    db.noteHistory.restore.mockClear();
  });

  it("no active note → empty sessions + no preview", async () => {
    useEditorLayoutStore().init();
    useNotesStore();
    const h = useNoteHistoryStore();
    await h.refresh();
    expect(h.activeNoteId).toBeNull();
    expect(h.sessions).toEqual([]);
    expect(h.preview).toBe("");
    expect(h.previewSessionId).toBeNull();
  });

  it("refresh lists revisions newest-first", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db._sessions.set("a", [
      fakeSession({ id: "s1", noteId: "a", dateModified: 10 }),
      fakeSession({ id: "s3", noteId: "a", dateModified: 90 }),
      fakeSession({ id: "s2", noteId: "a", dateModified: 50 })
    ]);
    const h = useNoteHistoryStore();
    await h.refresh();
    expect(db.noteHistory.get).toHaveBeenCalledWith("a");
    expect(h.sessions.map((s) => s.id)).toEqual(["s3", "s2", "s1"]);
    expect(h.loading).toBe(false);
  });

  it("refresh is empty for a note with no revisions", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    const h = useNoteHistoryStore();
    await h.refresh();
    expect(h.sessions).toEqual([]);
  });

  it("loadPreview reads the session body and sets previewSessionId", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db._content.set("s1", { data: "Hello world", type: "tiptap" });
    const h = useNoteHistoryStore();
    await h.loadPreview("s1");
    expect(db.noteHistory.content).toHaveBeenCalledWith("s1");
    expect(h.preview).toBe("Hello world");
    expect(h.previewSessionId).toBe("s1");
    expect(h.lastError).toBeNull();
    expect(h.busy).toBe(false);
  });

  it("loadPreview surfaces a locked revision as empty preview + lastError", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    // locked content returns a Cipher object (not a string) — typed loose here
    db._content.set("s1", { data: "U2FsdGVkX1..." as unknown as string, type: "tiptap" });
    // pretend it's a Cipher: override content() to return a non-string object
    db.noteHistory.content.mockResolvedValueOnce({ data: { cipher: "x" } as never, type: "tiptap" });
    const h = useNoteHistoryStore();
    await h.loadPreview("s1");
    expect(h.preview).toBe("");
    expect(h.previewSessionId).toBe("s1");
    expect(h.lastError).toContain("locked");
  });

  it("loadPreview never throws + sets lastError when content() rejects", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db.noteHistory.content.mockRejectedValueOnce(new Error("boom"));
    const h = useNoteHistoryStore();
    await h.loadPreview("s1");
    expect(h.lastError).toBe("boom");
    expect(h.preview).toBe("");
    expect(h.previewSessionId).toBeNull();
    expect(h.busy).toBe(false);
  });

  it("restore calls db.noteHistory.restore(id) + reloads + returns true", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db._sessions.set("a", [fakeSession({ id: "s1", noteId: "a", dateModified: 10 })]);
    const h = useNoteHistoryStore();
    const ok = await h.restore("s1");
    expect(ok).toBe(true);
    expect(db.noteHistory.restore).toHaveBeenCalledWith("s1");
    expect(h.lastError).toBeNull();
    expect(h.busy).toBe(false);
    expect(db.notes.all.items).toHaveBeenCalled();
  });

  it("restore returns false + sets lastError when db.noteHistory.restore throws", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db.noteHistory.restore.mockRejectedValueOnce(new Error("cannot restore"));
    const h = useNoteHistoryStore();
    const ok = await h.restore("s1");
    expect(ok).toBe(false);
    expect(h.lastError).toBe("cannot restore");
    expect(h.busy).toBe(false);
  });

  it("active-note switch reseeds the list + clears the preview", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db._sessions.set("a", [fakeSession({ id: "s1", noteId: "a", dateModified: 10 })]);
    db._content.set("s1", { data: "preview body", type: "tiptap" });
    const h = useNoteHistoryStore();
    await h.refresh();
    await h.loadPreview("s1");
    expect(h.preview).toBe("preview body");
    // switch to note b (no revisions)
    await openNote(fakeNote({ id: "b", title: "B" }));
    await h.refresh();
    expect(h.sessions).toEqual([]);
    expect(h.preview).toBe("");
    expect(h.previewSessionId).toBeNull();
  });
});