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
  textMentionsDate
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