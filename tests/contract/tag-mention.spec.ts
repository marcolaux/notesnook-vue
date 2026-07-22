/**
 * Pure-logic contract tests for the inline `#` tag picker (Phase 5.4).
 * `buildTagSuggestions` is framework-free and reused by the host bridge
 * (`editor/tag-mention-bridge.ts`); the popup rendering, NodeView, and the
 * live Pinia wiring are exercised on-site (visual gate).
 */
import { describe, it, expect } from "vitest";
import { buildTagSuggestions } from "@/utils/tag-mention";
import type { TagMentionCandidate } from "@/utils/tag-mention";

const TAGS: TagMentionCandidate[] = [
  { id: "t1", title: "work" },
  { id: "t2", title: "weekend" },
  { id: "t3", title: "Web" },
  { id: "t4", title: "rust-lang" }
];

describe("buildTagSuggestions", () => {
  it("empty query returns up to `max` existing tags and no create row", () => {
    const items = buildTagSuggestions(TAGS, "");
    expect(items.length).toBe(4);
    expect(items.every((i) => !i.isNew)).toBe(true);
    expect(items.map((i) => i.id)).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("respects the max cap", () => {
    const items = buildTagSuggestions(TAGS, "", 2);
    expect(items.length).toBe(2);
  });

  it("subsequence-matches and ranks title matches first", () => {
    // "wo" matches "work" (title) — no create row since "wo" isn't an exact title.
    const items = buildTagSuggestions(TAGS, "wo");
    expect(items.map((i) => i.title)).toContain("work");
    const create = items.find((i) => i.isNew);
    expect(create).toBeDefined();
    expect(create?.title).toBe("wo");
  });

  it("matching is case-insensitive for the exact-title check", () => {
    // "web" exactly matches the existing "Web" (case-insensitive) → NO create row.
    const items = buildTagSuggestions(TAGS, "web");
    expect(items.some((i) => i.id === "t3")).toBe(true);
    expect(items.some((i) => i.isNew)).toBe(false);
  });

  it("appends a create row when no exact title match exists", () => {
    const items = buildTagSuggestions(TAGS, "newtag");
    const create = items.find((i) => i.isNew);
    expect(create).toBeDefined();
    expect(create?.id).toBe("__new__");
    expect(create?.title).toBe("newtag");
  });

  it("does not duplicate the create row for a partial (non-exact) match", () => {
    // "wee" subsequence-matches "weekend" but is not an exact title → one create row.
    const items = buildTagSuggestions(TAGS, "wee");
    const createRows = items.filter((i) => i.isNew);
    expect(createRows.length).toBe(1);
    expect(createRows[0].title).toBe("wee");
  });

  it("trims the query before the exact-title check", () => {
    // "  work  " trims to "work" which exactly matches → no create row.
    const items = buildTagSuggestions(TAGS, "  work  ");
    expect(items.some((i) => i.id === "t1")).toBe(true);
    expect(items.some((i) => i.isNew)).toBe(false);
  });

  it("subsequence matches across hyphenated titles", () => {
    // "rl" subsequence-matches "rust-lang" (r… l…).
    const items = buildTagSuggestions(TAGS, "rl");
    expect(items.map((i) => i.title)).toContain("rust-lang");
    expect(items.some((i) => i.isNew)).toBe(true);
  });

  it("an empty tag list with a query yields only the create row", () => {
    const items = buildTagSuggestions([], "solo");
    expect(items.length).toBe(1);
    expect(items[0].isNew).toBe(true);
    expect(items[0].title).toBe("solo");
  });

  it("an empty tag list with an empty query yields no items", () => {
    expect(buildTagSuggestions([], "")).toEqual([]);
  });
});