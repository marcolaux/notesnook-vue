// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";

// --- Mocks: keep the daily-notes store isolated from the db + sibling stores --
// `mockItems` is a stable mutable array (vi.hoisted so it's available to the
// hoisted vi.mock factory) so a test can add a "live" note to `notes.items` to
// exercise the refreshDailyNotes merge-preserve (create race).
const { mockItems } = vi.hoisted(() => ({ mockItems: [] as unknown[] }));

let mockDb: any;
const notesCreate = vi.fn();
const openNote = vi.fn();
const clearActiveTab = vi.fn();

vi.mock("@/platform/bootstrap", () => ({
  getCurrentContext: () => "local",
  getDatabase: () => mockDb,
  bootstrap: vi.fn()
}));

vi.mock("@/stores/notes", () => ({
  useNotesStore: () => ({
    items: mockItems,
    previews: {} as Record<string, unknown>,
    create: notesCreate
  })
}));

vi.mock("@/stores/settings", () => ({
  useSettingsStore: () => ({ dateFormat: ref("DD-MM-YYYY") })
}));

vi.mock("@/stores/editor-layout", () => ({
  useEditorLayoutStore: () => ({
    openNote,
    activeGroupId: "group-1",
    clearActiveTab
  })
}));

import { useDailyNotesStore } from "@/stores/daily-notes";

/** Build a fresh fake db with a controllable set of daily-tagged notes. */
function makeDb(opts: { tagId?: string; notes?: any[] } = {}): any {
  const tagId = opts.tagId ?? null;
  const dailyNotes = opts.notes ?? [];
  return {
    tags: {
      find: vi.fn(async (title: string) =>
        title === "daily" && tagId ? { id: tagId, title } : null
      ),
      add: vi.fn(async () => "tag-daily")
    },
    relations: {
      from: vi.fn(() => ({ resolve: vi.fn(async () => dailyNotes) })),
      add: vi.fn(async () => undefined)
    }
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  notesCreate.mockReset();
  openNote.mockReset();
  clearActiveTab.mockReset();
  mockItems.length = 0; // reset the shared notes.items mock
  notesCreate.mockResolvedValue("note-new");
});

describe("useDailyNotesStore — ensureDailyNote", () => {
  it("creates + tags a daily note when none exists, and memoizes", async () => {
    mockDb = makeDb(); // no tag, no daily notes
    const daily = useDailyNotesStore();

    const r = await daily.ensureDailyNote("2026-07-29");
    expect(r).toEqual({ id: "note-new", title: "2026-07-29" });
    expect(notesCreate).toHaveBeenCalledWith({ title: "2026-07-29", openNote: false, content: "" });
    expect(mockDb.tags.add).toHaveBeenCalledWith({ title: "daily" }); // tag created lazily
    expect(mockDb.relations.add).toHaveBeenCalledWith(
      { id: "tag-daily", type: "tag" },
      { id: "note-new", type: "note" }
    );

    // Second call is memoized — no recreate, no second tag/relation write.
    notesCreate.mockClear();
    mockDb.tags.add.mockClear();
    mockDb.relations.add.mockClear();
    const r2 = await daily.ensureDailyNote("2026-07-29");
    expect(r2).toEqual({ id: "note-new", title: "2026-07-29" });
    expect(notesCreate).not.toHaveBeenCalled();
    expect(mockDb.relations.add).not.toHaveBeenCalled();
  });

  it("finds an existing daily note by ISO title and does NOT recreate", async () => {
    mockDb = makeDb({
      tagId: "tag-daily",
      notes: [{ id: "note-existing", title: "2026-07-29", dateCreated: 0 }]
    });
    const daily = useDailyNotesStore();

    const r = await daily.ensureDailyNote("2026-07-29");
    expect(r).toEqual({ id: "note-existing", title: "2026-07-29" });
    expect(notesCreate).not.toHaveBeenCalled();
    expect(mockDb.tags.add).not.toHaveBeenCalled();
  });

  it("returns null when notes.create yields no id", async () => {
    mockDb = makeDb();
    notesCreate.mockResolvedValue(undefined);
    const daily = useDailyNotesStore();
    const r = await daily.ensureDailyNote("2026-07-29");
    expect(r).toBeNull();
  });
});

describe("useDailyNotesStore — openDailyNote (non-creating)", () => {
  it("opens an existing daily note without creating and clears pendingDailyDate", async () => {
    mockDb = makeDb({
      tagId: "tag-daily",
      notes: [{ id: "note-existing", title: "2026-07-29", dateCreated: 0 }]
    });
    const daily = useDailyNotesStore();
    await daily.openDailyNote("2026-07-29");
    expect(openNote).toHaveBeenCalledWith("note-existing");
    expect(notesCreate).not.toHaveBeenCalled();
    expect(daily.selectedDate).toBe("2026-07-29");
    expect(daily.pendingDailyDate).toBeNull();
    expect(clearActiveTab).not.toHaveBeenCalled();
  });

  it("does NOT create when none exists — sets pendingDailyDate + clears the active tab (reveals a draft)", async () => {
    mockDb = makeDb(); // no daily notes
    const daily = useDailyNotesStore();
    await daily.openDailyNote("2026-08-01");
    expect(notesCreate).not.toHaveBeenCalled(); // the key change: no creation on click
    expect(openNote).not.toHaveBeenCalled();
    expect(daily.pendingDailyDate).toBe("2026-08-01");
    expect(clearActiveTab).toHaveBeenCalledWith("group-1");
  });
});

describe("useDailyNotesStore — createDailyNote (explicit create)", () => {
  it("creates + opens the daily note immediately and clears pendingDailyDate", async () => {
    mockDb = makeDb();
    const daily = useDailyNotesStore();
    await daily.createDailyNote("2026-07-30");
    expect(notesCreate).toHaveBeenCalledWith({ title: "2026-07-30", openNote: false, content: "" });
    expect(openNote).toHaveBeenCalledWith("note-new");
    expect(daily.pendingDailyDate).toBeNull();
  });
});

describe("useDailyNotesStore — claimDraft", () => {
  it("tags an already-created note as daily + memoizes + clears pendingDailyDate", async () => {
    mockDb = makeDb({ tagId: "tag-daily" });
    const daily = useDailyNotesStore();
    daily.pendingDailyDate = "2026-09-01";
    await daily.claimDraft("note-drafted", "2026-09-01");
    expect(mockDb.relations.add).toHaveBeenCalledWith(
      { id: "tag-daily", type: "tag" },
      { id: "note-drafted", type: "note" }
    );
    expect(daily.dailyNoteIdFor("2026-09-01")).toBe("note-drafted");
    expect(daily.pendingDailyDate).toBeNull();
  });
});

describe("useDailyNotesStore — ensureDailyTag find-first", () => {
  it("does not create the tag when it already exists", async () => {
    mockDb = makeDb({ tagId: "tag-existing" });
    const daily = useDailyNotesStore();
    // Trigger ensureDailyTag via ensureDailyNote on a missing date.
    notesCreate.mockResolvedValue("note-x");
    await daily.ensureDailyNote("2026-08-01");
    expect(mockDb.tags.find).toHaveBeenCalledWith("daily");
    expect(mockDb.tags.add).not.toHaveBeenCalled();
  });
});

describe("useDailyNotesStore — refreshDailyNotes trashed filter + fresh memo", () => {
  it("drops trashed daily notes so a deleted note's timeline dot disappears", async () => {
    mockDb = makeDb({
      tagId: "tag-daily",
      notes: [
        { id: "n-29", title: "2026-07-29", dateCreated: 0, deleted: false },
        { id: "n-30", title: "2026-07-30", dateCreated: 0, deleted: true }
      ]
    });
    const daily = useDailyNotesStore();
    await daily.refreshDailyNotes();
    expect(daily.dailyNoteIdFor("2026-07-29")).toBe("n-29");
    expect(daily.dailyNoteIdFor("2026-07-30")).toBeNull(); // trashed → dropped
    expect(daily.dailyNoteIds.has("n-30")).toBe(false);
    expect(daily.dailyDates.has("2026-07-30")).toBe(false);
  });

  it("rebuilds the memo from scratch — a stale entry from a prior refresh is cleared on delete", async () => {
    mockDb = makeDb({
      tagId: "tag-daily",
      notes: [{ id: "n-29", title: "2026-07-29", dateCreated: 0, deleted: false }]
    });
    const daily = useDailyNotesStore();
    await daily.refreshDailyNotes();
    expect(daily.dailyNoteIdFor("2026-07-29")).toBe("n-29");

    // Simulate the note being trashed: the relation set now returns it deleted.
    mockDb = makeDb({
      tagId: "tag-daily",
      notes: [{ id: "n-29", title: "2026-07-29", dateCreated: 0, deleted: true }]
    });
    await daily.refreshDailyNotes();
    expect(daily.dailyNoteIdFor("2026-07-29")).toBeNull(); // stale entry cleared
    expect(daily.dailyDates.has("2026-07-29")).toBe(false);
  });

  it("preserves an optimistic entry for a just-created note whose tag relation hasn't landed (create race)", async () => {
    // The relation set does NOT yet include the new note (the tag relation is
    // added after claimDraft's await), but the note IS live in notes.items.
    mockDb = makeDb({ tagId: "tag-daily", notes: [] });
    mockItems.push({ id: "note-new", dateCreated: 0, dateEdited: 0 });
    const daily = useDailyNotesStore();
    // claimDraft sets the optimistic memo entry synchronously, before its async
    // tag work; don't await it (simulate the create→tag race).
    void daily.claimDraft("note-new", "2026-07-29");
    // A concurrent refreshDailyNotes (from createDraft's load) runs before the
    // relation lands — it must NOT wipe the optimistic entry.
    await daily.refreshDailyNotes();
    expect(daily.dailyNoteIdFor("2026-07-29")).toBe("note-new");
    expect(daily.dailyDates.has("2026-07-29")).toBe(true);
  });
});

describe("useDailyNotesStore — invalidate", () => {
  it("wipes the memo + resets the selected date to today", async () => {
    mockDb = makeDb();
    const daily = useDailyNotesStore();
    await daily.ensureDailyNote("2026-07-29");
    daily.invalidate();
    // After invalidation the memo is gone, so a fresh lookup recreates.
    notesCreate.mockClear();
    mockDb.tags.add.mockClear();
    await daily.ensureDailyNote("2026-07-29");
    expect(notesCreate).toHaveBeenCalled();
  });
});