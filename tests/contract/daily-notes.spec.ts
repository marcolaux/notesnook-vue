// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  DAILY_TAG_TITLE,
  DEFAULT_DATE_FORMAT,
  DAY_MS,
  midnight,
  isoDate,
  parseIsoDate,
  addDays,
  dayRange,
  buildDateRegex,
  buildStrictDateRegex,
  buildDateParser,
  parseDateToken,
  findDateTokens,
  textMentionsDate,
  attributeTasks,
  type NoteTaskInput,
  type TaskAttribution
} from "@/utils/daily-notes";

describe("daily-notes — iso / day-range", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    expect(isoDate(new Date(2026, 6, 29))).toBe("2026-07-29");
    expect(isoDate(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("parses strict ISO dates and rejects garbage", () => {
    expect(parseIsoDate("2026-07-29")?.getDate()).toBe(29);
    expect(parseIsoDate("2026-13-01")).toBeNull(); // bad month
    expect(parseIsoDate("2026-02-31")).toBeNull(); // rollover
    expect(parseIsoDate("not a date")).toBeNull();
    expect(parseIsoDate("2026-7-9")?.getDate()).toBe(9); // 1-2 digit ok
  });

  it("midnight + dayRange cover one local calendar day", () => {
    const d = new Date(2026, 6, 29, 13, 45, 10);
    const mid = midnight(d);
    expect(new Date(mid).getHours()).toBe(0);
    const r = dayRange(d);
    expect(r.start).toBe(mid);
    expect(r.end - r.start).toBe(DAY_MS);
  });

  it("dayRange accepts an ISO string", () => {
    const r = dayRange("2026-07-29");
    expect(new Date(r.start)).toEqual(new Date(2026, 6, 29));
    expect(r.end - r.start).toBe(DAY_MS);
  });

  it("addDays crosses month boundaries", () => {
    expect(isoDate(addDays(new Date(2026, 6, 29), 1))).toBe("2026-07-30");
    expect(isoDate(addDays(new Date(2026, 6, 31), 1))).toBe("2026-08-01");
    expect(isoDate(addDays(new Date(2026, 0, 1), -1))).toBe("2025-12-31");
  });

  it("exports the reserved tag title", () => {
    expect(DAILY_TAG_TITLE).toBe("daily");
  });
});

describe("daily-notes — date token detection + parsing", () => {
  it("detects ISO dates in text", () => {
    const re = buildDateRegex();
    const matches = "see you 2026-07-29 then".match(re);
    expect(matches).toEqual(["2026-07-29"]);
  });

  it("detects dates in a DD-MM-YYYY format", () => {
    const re = buildDateRegex("DD-MM-YYYY");
    expect("buy milk 29-07-2026 ok".match(re)).toEqual(["29-07-2026"]);
  });

  it("detects dates in an MM/DD/YYYY format", () => {
    const re = buildDateRegex("MM/DD/YYYY");
    expect("due 07/29/2026.".match(re)).toEqual(["07/29/2026"]);
  });

  it("does not match date-shaped runs inside longer numbers", () => {
    const re = buildDateRegex();
    expect("123456-07-29".match(re)).toBeNull(); // leading digits break ISO year
    expect("2026-07-2999".match(re)).toBeNull(); // trailing digits break day
  });

  it("parseDateToken normalizes ISO and format tokens to the same ISO", () => {
    expect(parseDateToken("2026-07-29")?.iso).toBe("2026-07-29");
    expect(parseDateToken("29-07-2026", "DD-MM-YYYY")?.iso).toBe("2026-07-29");
    expect(parseDateToken("07/29/2026", "MM/DD/YYYY")?.iso).toBe("2026-07-29");
  });

  it("parseDateToken rejects invalid dates in a format", () => {
    expect(parseDateToken("31-13-2026", "DD-MM-YYYY")).toBeNull(); // bad month
    expect(parseDateToken("31-02-2026", "DD-MM-YYYY")).toBeNull(); // rollover
  });

  it("parseDateToken handles 2-digit years via YY", () => {
    expect(parseDateToken("29-07-26", "DD-MM-YY")?.iso).toBe("2026-07-29");
  });

  it("findDateTokens returns offsets + normalized ISO, skipping invalid runs", () => {
    const ts = findDateTokens("do 2026-07-29 and 2026-13-40 then 29-07-2026", "DD-MM-YYYY");
    expect(ts.map((t) => t.iso)).toEqual(["2026-07-29", "2026-07-29"]);
    const first = ts[0]!;
    expect("do 2026-07-29 and".slice(first.start, first.end)).toBe("2026-07-29");
  });

  it("textMentionsDate matches by normalized ISO across formats", () => {
    expect(textMentionsDate("meeting 2026-07-29", "2026-07-29")).toBe(true);
    expect(textMentionsDate("meeting 29-07-2026", "2026-07-29", "DD-MM-YYYY")).toBe(true);
    expect(textMentionsDate("nothing here", "2026-07-29")).toBe(false);
  });

  it("default format constant matches the settings fallback", () => {
    expect(DEFAULT_DATE_FORMAT).toBe("DD-MM-YYYY");
  });

  it("buildStrictDateRegex does not match partial dates mid-typing", () => {
    const re = buildStrictDateRegex("DD-MM-YYYY");
    expect("29-07-2026".match(re)).toEqual(["29-07-2026"]);
    expect("29-07-2".match(re)).toBeNull(); // 1-digit day — still typing
    expect("abc29-07-2026".match(re)).toBeNull(); // inside a word
    expect("29-07-2026abc".match(re)).toBeNull(); // trailing word chars
  });

  it("buildStrictDateRegex matches ISO strictly", () => {
    const re = buildStrictDateRegex();
    expect("2026-07-29".match(re)).toEqual(["2026-07-29"]);
    expect("2026-7-9".match(re)).toBeNull(); // 1-digit not allowed in strict mode
  });

  it("buildDateParser order tracks the format fields", () => {
    expect(buildDateParser("DD-MM-YYYY").order).toEqual(["day", "month", "year"]);
    expect(buildDateParser("YYYY-MM-DD").order).toEqual(["year", "month", "day"]);
  });
});

describe("daily-notes — attributeTasks (per-day open task attribution)", () => {
  // ISO tokens are detected regardless of `dateFormat` (buildDateRegex always
  // includes the ISO alternative), so the default format suffices here.
  const FMT = DEFAULT_DATE_FORMAT;
  const D = "2026-07-30";
  const NEXT = "2026-07-31";

  /** Open item shorthand (`checked: false`). */
  const open = (text: string) => ({ text, checked: false });

  const count = (m: Map<string, TaskAttribution[]>, iso: string) =>
    m.get(iso)?.length ?? 0;

  it("channel 1 — attributes an item whose text mentions the date", () => {
    const m = attributeTasks(
      [
        {
          noteId: "n1",
          noteTitle: "n1",
          dailyDay: null,
          createdDay: "2026-01-01",
          items: [open("do X 2026-07-30")],
          contentText: "do X 2026-07-30"
        }
      ],
      FMT
    );
    expect(count(m, D)).toBe(1);
  });

  it("channel 2 — attributes every open item in the day's daily note", () => {
    const m = attributeTasks(
      [
        {
          noteId: "daily",
          noteTitle: "daily",
          dailyDay: D,
          createdDay: "2026-01-01",
          items: [open("task A"), open("task B")],
          contentText: "task A task B"
        }
      ],
      FMT
    );
    expect(count(m, D)).toBe(2);
  });

  it("channel 3 — attributes every open item in a note created that day (no other-day link)", () => {
    const m = attributeTasks(
      [
        {
          noteId: "n3",
          noteTitle: "n3",
          dailyDay: null,
          createdDay: D,
          items: [open("task A"), open("task B")],
          contentText: "task A task B"
        }
      ],
      FMT
    );
    expect(count(m, D)).toBe(2);
  });

  it("channel 3 exclusion — a note created that day but linking to another day is NOT attributed to it", () => {
    const m = attributeTasks(
      [
        {
          noteId: "n4",
          noteTitle: "n4",
          dailyDay: null,
          createdDay: D,
          items: [open("task A"), open("see 2026-07-31")],
          // Mentions NEXT (≠ createdDay) → "links to another day" → ch3 gated off.
          contentText: "task A see 2026-07-31"
        }
      ],
      FMT
    );
    expect(m.get(D)).toBeUndefined(); // ch3 off; neither item mentions D
    expect(count(m, NEXT)).toBe(1); // ch1: the item mentioning NEXT
  });

  it("dedup — an item matching several channels for one day is listed once", () => {
    // Daily note for D, its single item also mentions D: ch1 + ch2 + ch3 all -> D.
    const m = attributeTasks(
      [
        {
          noteId: "daily",
          noteTitle: "daily",
          dailyDay: D,
          createdDay: D,
          items: [open("do 2026-07-30")],
          contentText: "do 2026-07-30"
        }
      ],
      FMT
    );
    expect(count(m, D)).toBe(1);
  });

  it("cross-day — a daily-note item mentioning another day counts on both days", () => {
    const m = attributeTasks(
      [
        {
          noteId: "daily",
          noteTitle: "daily",
          dailyDay: D,
          createdDay: "2026-01-01",
          items: [open("follow up 2026-07-31")],
          contentText: "follow up 2026-07-31"
        }
      ],
      FMT
    );
    expect(count(m, D)).toBe(1); // ch2 (inside D's daily note)
    expect(count(m, NEXT)).toBe(1); // ch1 (item mentions NEXT)
  });

  it("aggregates across notes with per-item identity (no cross-note collisions)", () => {
    const m = attributeTasks(
      [
        {
          noteId: "a",
          noteTitle: "a",
          dailyDay: null,
          createdDay: D,
          items: [open("a1"), open("a2")],
          contentText: "a1 a2"
        },
        {
          noteId: "b",
          noteTitle: "b",
          dailyDay: D,
          createdDay: "2026-01-01",
          items: [open("b1")],
          contentText: "b1"
        }
      ],
      FMT
    );
    // 2 from note a (ch3) + 1 from note b (ch2) = 3 unique items on D.
    expect(count(m, D)).toBe(3);
  });

  it("skips checked (completed) items — only OPEN tasks are listed", () => {
    const m = attributeTasks(
      [
        {
          noteId: "daily",
          noteTitle: "daily",
          dailyDay: D,
          createdDay: "2026-01-01",
          items: [open("open task"), { text: "done task", checked: true }],
          contentText: "open task done task"
        }
      ],
      FMT
    );
    expect(count(m, D)).toBe(1);
    expect(m.get(D)?.[0]?.itemText).toBe("open task");
  });

  it("a checked item mentioning a date is NOT attributed to that date", () => {
    const m = attributeTasks(
      [
        {
          noteId: "n",
          noteTitle: "n",
          dailyDay: null,
          createdDay: "2026-01-01",
          items: [{ text: "done 2026-07-30", checked: true }],
          contentText: "done 2026-07-30"
        }
      ],
      FMT
    );
    expect(m.get(D)).toBeUndefined();
  });

  it("carries note title + stable item index for panel rows + list keys", () => {
    const m = attributeTasks(
      [
        {
          noteId: "daily",
          noteTitle: "My Day",
          dailyDay: D,
          createdDay: "2026-01-01",
          items: [open("first"), open("second")],
          contentText: "first second"
        }
      ],
      FMT
    );
    const rows = m.get(D)!;
    expect(rows.map((r) => r.noteTitle)).toEqual(["My Day", "My Day"]);
    expect(rows.map((r) => r.itemIndex)).toEqual([0, 1]);
    expect(rows.map((r) => r.itemText)).toEqual(["first", "second"]);
  });

  it("returns an empty map for no checklist items", () => {
    expect(attributeTasks([], FMT).size).toBe(0);
  });
});