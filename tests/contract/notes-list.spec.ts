// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  filterNotes,
  sortNotes,
  DEFAULT_SORT_KEY,
  DEFAULT_SORT_DIR
} from "@/utils/notes-list";
import { useNotesStore } from "@/stores/notes";
import type { NoteListItem } from "@/stores/notes";

// notes.ts imports `getDatabase` from bootstrap; stub it so the platform
// graph (sodium/crypto/bridge) isn't loaded for a pure store-logic test.
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => ({}),
  bootstrap: vi.fn()
}));

function item(partial: Partial<NoteListItem> & Pick<NoteListItem, "id" | "title">): NoteListItem {
  return {
    id: partial.id,
    title: partial.title,
    headline: partial.headline ?? "",
    dateCreated: partial.dateCreated ?? 0,
    dateEdited: partial.dateEdited ?? partial.dateCreated ?? 0,
    tags: partial.tags ?? [],
    pinned: partial.pinned ?? false,
    favorite: partial.favorite ?? false
  };
}

const SAMPLE: NoteListItem[] = [
  item({ id: "a", title: "Alpha", headline: "first note", dateCreated: 100, dateEdited: 300, tags: ["work"] }),
  item({ id: "b", title: "Beta Project", headline: "second", dateCreated: 200, dateEdited: 200, tags: ["home", "work"] }),
  item({ id: "c", title: "Gamma", headline: "third note here", dateCreated: 300, dateEdited: 100, tags: ["personal"] })
];

describe("filterNotes", () => {
  it("empty query returns all items", () => {
    expect(filterNotes(SAMPLE, "", { regex: false }).map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("plain case-insensitive match on title", () => {
    expect(filterNotes(SAMPLE, "beta", { regex: false }).map((n) => n.id)).toEqual(["b"]);
  });

  it("plain match on headline", () => {
    expect(filterNotes(SAMPLE, "third", { regex: false }).map((n) => n.id)).toEqual(["c"]);
  });

  it("plain match on tag", () => {
    expect(filterNotes(SAMPLE, "work", { regex: false }).map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("no match returns empty", () => {
    expect(filterNotes(SAMPLE, "zzz", { regex: false })).toEqual([]);
  });

  it("regex mode matches a pattern across fields", () => {
    expect(filterNotes(SAMPLE, "^A", { regex: true }).map((n) => n.id)).toEqual(["a"]);
    // "first note" headline ends with "note"; "third note here" does not.
    expect(filterNotes(SAMPLE, "note$", { regex: true }).map((n) => n.id)).toEqual(["a"]);
  });

  it("invalid regex falls back to plain substring (no throw, no empty list)", () => {
    expect(() => filterNotes(SAMPLE, "(unclosed", { regex: true })).not.toThrow();
    expect(filterNotes(SAMPLE, "Beta", { regex: true }).map((n) => n.id)).toEqual(["b"]);
  });

  it("whitespace-only query is treated as empty", () => {
    expect(filterNotes(SAMPLE, "   ", { regex: false }).map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});

describe("sortNotes", () => {
  it("default key/dir constants", () => {
    expect(DEFAULT_SORT_KEY).toBe("dateEdited");
    expect(DEFAULT_SORT_DIR).toBe("desc");
  });

  it("sorts by dateEdited desc (most recent first)", () => {
    expect(sortNotes(SAMPLE, "dateEdited", "desc").map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts by dateEdited asc", () => {
    expect(sortNotes(SAMPLE, "dateEdited", "asc").map((n) => n.id)).toEqual(["c", "b", "a"]);
  });

  it("sorts by dateCreated desc", () => {
    expect(sortNotes(SAMPLE, "dateCreated", "desc").map((n) => n.id)).toEqual(["c", "b", "a"]);
  });

  it("sorts by title asc, case-insensitive + numeric", () => {
    expect(sortNotes(SAMPLE, "title", "asc").map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input", () => {
    const copy = [...SAMPLE];
    sortNotes(SAMPLE, "title", "asc");
    expect(SAMPLE.map((n) => n.id)).toEqual(copy.map((n) => n.id));
  });

  it("pinned notes always stay on top, regardless of sort key/direction", () => {
    const withPin = [
      item({ id: "late", title: "Late", dateEdited: 900, pinned: false }),
      item({ id: "early-pin", title: "Early", dateEdited: 50, pinned: true }),
      item({ id: "mid", title: "Mid", dateEdited: 500, pinned: false })
    ];
    expect(sortNotes(withPin, "dateEdited", "desc").map((n) => n.id)).toEqual([
      "early-pin",
      "late",
      "mid"
    ]);
    expect(sortNotes(withPin, "dateEdited", "asc").map((n) => n.id)).toEqual([
      "early-pin",
      "mid",
      "late"
    ]);
  });
});

describe("useNotesStore view state", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("visibleItems mirrors items by default (sorted edited-desc)", () => {
    const notes = useNotesStore();
    notes.items = SAMPLE;
    expect(notes.visibleItems.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("setQuery filters visibleItems", () => {
    const notes = useNotesStore();
    notes.items = SAMPLE;
    notes.setQuery("work");
    expect(notes.visibleItems.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("regex toggle switches search mode", () => {
    const notes = useNotesStore();
    notes.items = SAMPLE;
    notes.toggleRegex();
    expect(notes.regexSearch).toBe(true);
    notes.setQuery("^A");
    expect(notes.visibleItems.map((n) => n.id)).toEqual(["a"]);
  });

  it("changing sort key/dir re-orders visibleItems", () => {
    const notes = useNotesStore();
    notes.items = SAMPLE;
    notes.setSortKey("title");
    notes.setSortDir("asc");
    expect(notes.visibleItems.map((n) => n.id)).toEqual(["a", "b", "c"]);
    notes.setSortDir("desc");
    expect(notes.visibleItems.map((n) => n.id)).toEqual(["c", "b", "a"]);
  });

  it("toggleSortDir flips asc↔desc", () => {
    const notes = useNotesStore();
    notes.items = SAMPLE;
    expect(notes.sortDir).toBe("desc");
    notes.toggleSortDir();
    expect(notes.sortDir).toBe("asc");
  });

  it("clearSearch empties the query and restores all items", () => {
    const notes = useNotesStore();
    notes.items = SAMPLE;
    notes.setQuery("zzz");
    expect(notes.visibleItems).toHaveLength(0);
    notes.clearSearch();
    expect(notes.query).toBe("");
    expect(notes.visibleItems).toHaveLength(3);
  });

  it("focusSearch increments the signal (palette command)", () => {
    const notes = useNotesStore();
    expect(notes.focusSearchSignal).toBe(0);
    notes.focusSearch();
    notes.focusSearch();
    expect(notes.focusSearchSignal).toBe(2);
  });

  it("filter + sort compose (search respects sort)", () => {
    const notes = useNotesStore();
    notes.items = SAMPLE;
    notes.setQuery("note"); // matches a (headline "first note") + c (headline "third note here")
    notes.setSortKey("dateEdited");
    notes.setSortDir("asc");
    expect(notes.visibleItems.map((n) => n.id)).toEqual(["c", "a"]);
  });
});