// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  filterNotes,
  sortNotes,
  groupNotes,
  dateBucket,
  highlightSegments,
  DEFAULT_SORT_KEY,
  DEFAULT_SORT_DIR,
  DEFAULT_GROUP_KEY
} from "@/utils/notes-list";
import { useNotesStore } from "@/stores/notes";
import type { NoteListItem } from "@/stores/notes";

// notes.ts imports `getDatabase` from bootstrap; stub it so the platform
// graph (sodium/crypto/bridge) isn't loaded for a pure store-logic test.
vi.mock("@/platform/bootstrap", () => ({
  getCurrentContext: () => "local",
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

describe("useNotesStore favorites", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("favorites lists only favourite notes, dateEdited-desc", () => {
    const notes = useNotesStore();
    notes.items = [
      item({ id: "a", title: "Alpha", dateEdited: 100, favorite: true }),
      item({ id: "b", title: "Beta", dateEdited: 300, favorite: true }),
      item({ id: "c", title: "Gamma", dateEdited: 200, favorite: false })
    ];
    expect(notes.favorites).toEqual([
      { id: "b", title: "Beta", type: "note" },
      { id: "a", title: "Alpha", type: "note" }
    ]);
  });

  it("favorites is empty when nothing is favourited", () => {
    const notes = useNotesStore();
    notes.items = [item({ id: "a", title: "Alpha" }), item({ id: "b", title: "Beta" })];
    expect(notes.favorites).toEqual([]);
  });

  it("favorites re-evaluates when items change (toggle off drops the row)", () => {
    const notes = useNotesStore();
    notes.items = [item({ id: "a", title: "Alpha", dateEdited: 100, favorite: true })];
    expect(notes.favorites.map((f) => f.id)).toEqual(["a"]);
    notes.items = [item({ id: "a", title: "Alpha", dateEdited: 100, favorite: false })];
    expect(notes.favorites).toEqual([]);
  });
});

describe("groupNotes", () => {
  // `now` fixed at 2026-07-19T12:00:00 local — a Sunday. Lets us exercise every
  // date bucket deterministically regardless of when the suite runs.
  const NOW = new Date(2026, 6, 19, 12, 0, 0).getTime();
  const DAY = 86_400_000;
  const midnight = (ts: number): number => {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };

  function at(offsetDays: number, hour = 10): number {
    return midnight(NOW) + offsetDays * DAY + hour * 3_600_000;
  }

  const GROUPED: NoteListItem[] = [
    item({ id: "today1", title: "T1", dateEdited: at(0) }),
    item({ id: "today2", title: "T2", dateEdited: at(0, 8) }),
    item({ id: "yest1", title: "Y1", dateEdited: at(-1) }),
    item({ id: "week1", title: "W1", dateEdited: at(-3) }),
    item({ id: "month1", title: "M1", dateEdited: at(-12) }),
    item({ id: "year1", title: "YR1", dateEdited: at(-100) }),
    item({ id: "old1", title: "O1", dateEdited: at(-800) })
  ];

  it("none returns a single headerless group (or [] when empty)", () => {
    expect(groupNotes(GROUPED, "none", NOW)).toEqual([
      { key: "", label: "", items: GROUPED }
    ]);
    expect(groupNotes([], "none", NOW)).toEqual([]);
  });

  it("date buckets by recency in chronological order, omitting empties", () => {
    const groups = groupNotes(GROUPED, "date", NOW);
    expect(groups.map((g) => g.key)).toEqual([
      "today",
      "yesterday",
      "this-week",
      "this-month",
      "this-year",
      "older"
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      "Today",
      "Yesterday",
      "Earlier this week",
      "Earlier this month",
      "Earlier this year",
      "Older"
    ]);
    expect(groups[0].items.map((n) => n.id)).toEqual(["today1", "today2"]);
    expect(groups[1].items.map((n) => n.id)).toEqual(["yest1"]);
  });

  it("date preserves sort order within a bucket", () => {
    // Sort GROUPED desc by dateEdited, then bucket — within "today" the
    // later-edited item (today1 at 10:00) comes before today2 (08:00).
    const sorted = sortNotes(GROUPED, "dateEdited", "desc");
    const groups = groupNotes(sorted, "date", NOW);
    expect(groups[0].items.map((n) => n.id)).toEqual(["today1", "today2"]);
  });

  it("date omits empty buckets", () => {
    const only = [item({ id: "today1", title: "T1", dateEdited: at(0) })];
    const groups = groupNotes(only, "date", NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("today");
  });

  it("does not mutate the input array", () => {
    const copy = [...GROUPED];
    groupNotes(GROUPED, "date", NOW);
    expect(GROUPED.map((n) => n.id)).toEqual(copy.map((n) => n.id));
  });

  it("falls back to dateCreated when dateEdited is 0", () => {
    const n = item({ id: "c", title: "C", dateCreated: at(-1), dateEdited: 0 });
    const groups = groupNotes([n], "date", NOW);
    expect(groups[0].key).toBe("yesterday");
  });
});

describe("dateBucket", () => {
  const NOW = new Date(2026, 6, 19, 12, 0, 0).getTime(); // Sunday
  const DAY = 86_400_000;
  const midnight = (ts: number): number => {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const at = (offsetDays: number, hour = 10): number =>
    midnight(NOW) + offsetDays * DAY + hour * 3_600_000;

  it("today for same calendar day (and future-dated)", () => {
    expect(dateBucket(at(0), NOW)).toBe("today");
    expect(dateBucket(at(0, 23), NOW)).toBe("today");
    expect(dateBucket(at(1), NOW)).toBe("today"); // future
  });

  it("yesterday for the previous calendar day", () => {
    expect(dateBucket(at(-1), NOW)).toBe("yesterday");
  });

  it("this-week for earlier in the current Mon–Sun week", () => {
    // NOW is Sunday; Mon of this week was 6 days ago. A note 3 days ago (Thursday)
    // is in this week but not today/yesterday.
    expect(dateBucket(at(-3), NOW)).toBe("this-week");
  });

  it("this-month for same month, before this week", () => {
    expect(dateBucket(at(-12), NOW)).toBe("this-month");
  });

  it("this-year for same year, earlier month", () => {
    expect(dateBucket(at(-100), NOW)).toBe("this-year");
  });

  it("older for a previous year", () => {
    expect(dateBucket(at(-800), NOW)).toBe("older");
  });
});

describe("notes store grouping", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("defaults to none", () => {
    const notes = useNotesStore();
    expect(notes.groupKey).toBe(DEFAULT_GROUP_KEY);
    expect(notes.groupKey).toBe("none");
  });

  it("setGroupKey switches mode", () => {
    const notes = useNotesStore();
    notes.setGroupKey("date");
    expect(notes.groupKey).toBe("date");
    notes.setGroupKey("none");
    expect(notes.groupKey).toBe("none");
  });
});

describe("highlightSegments", () => {
  it("empty query → one plain segment", () => {
    expect(highlightSegments("Hello world", "", { regex: false })).toEqual([
      { text: "Hello world", match: false }
    ]);
  });

  it("empty text → one plain segment", () => {
    expect(highlightSegments("", "foo", { regex: false })).toEqual([{ text: "", match: false }]);
  });

  it("plain highlights every case-insensitive occurrence", () => {
    expect(highlightSegments("Foo bar foo BAZ", "foo", { regex: false })).toEqual([
      { text: "Foo", match: true },
      { text: " bar ", match: false },
      { text: "foo", match: true },
      { text: " BAZ", match: false }
    ]);
  });

  it("no match → one plain segment with full text", () => {
    expect(highlightSegments("Hello world", "zzz", { regex: false })).toEqual([
      { text: "Hello world", match: false }
    ]);
  });

  it("trims the query (whitespace-only = no highlight)", () => {
    expect(highlightSegments("Hello world", "   ", { regex: false })).toEqual([
      { text: "Hello world", match: false }
    ]);
  });

  it("regex highlights all matches (case-sensitive like filterNotes)", () => {
    expect(highlightSegments("a1b2 a1b2", "a1", { regex: true })).toEqual([
      { text: "a1", match: true },
      { text: "b2 ", match: false },
      { text: "a1", match: true },
      { text: "b2", match: false }
    ]);
  });

  it("regex alternation highlights each branch", () => {
    expect(highlightSegments("cat dog bird", "cat|dog", { regex: true })).toEqual([
      { text: "cat", match: true },
      { text: " ", match: false },
      { text: "dog", match: true },
      { text: " bird", match: false }
    ]);
  });

  it("invalid regex falls back to plain substring", () => {
    const seg = highlightSegments("a(b", "(b", { regex: true });
    expect(seg).toEqual([
      { text: "a", match: false },
      { text: "(b", match: true }
    ]);
  });

  it("zero-length-only regex does not loop or emit empty matches", () => {
    // `(?=.)` matches the empty position before every char → three zero-length
    // matches on "abc". Must not infinite-loop and must not emit spurious
    // empty <mark> runs; the whole text stays one plain segment.
    const seg = highlightSegments("abc", "(?=.)", { regex: true });
    expect(seg).toEqual([{ text: "abc", match: false }]);
  });

  it("greedy quantifier matches the non-empty run", () => {
    // `a*` matches "a" at the start (one char), not the empty position.
    expect(highlightSegments("abc", "a*", { regex: true })).toEqual([
      { text: "a", match: true },
      { text: "bc", match: false }
    ]);
  });

  it("regex matching whole text emits one match segment", () => {
    expect(highlightSegments("hello", "hel+o", { regex: true })).toEqual([
      { text: "hello", match: true }
    ]);
  });
});