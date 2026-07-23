// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  createInternalLink,
  parseInternalLink,
  isInternalLink,
  isNoteLink,
  noteIdFromLink,
  blockIdFromLink,
  NN_PROTOCOL
} from "@notesnook-vue/editor-vue";

describe("createInternalLink", () => {
  it("builds an nn:// note link", () => {
    expect(createInternalLink("note", "abc")).toBe("nn://note/abc");
  });

  it("appends ?blockId= for a section link", () => {
    expect(createInternalLink("note", "abc", { blockId: "blk-1" })).toBe(
      "nn://note/abc?blockId=blk-1"
    );
  });

  it("omits the query when blockId is absent or empty", () => {
    expect(createInternalLink("note", "abc", {})).toBe("nn://note/abc");
    expect(createInternalLink("note", "abc", { blockId: "" })).toBe("nn://note/abc");
  });

  it("builds other kinds the same way", () => {
    expect(createInternalLink("notebook", "nb-7")).toBe("nn://notebook/nb-7");
    expect(createInternalLink("monograph", "m-42")).toBe("nn://monograph/m-42");
  });
});

describe("parseInternalLink", () => {
  it("parses a note link", () => {
    expect(parseInternalLink("nn://note/abc")).toEqual({
      type: "note",
      id: "abc",
      params: {}
    });
  });

  it("parses a block link and surfaces blockId in params", () => {
    expect(parseInternalLink("nn://note/abc?blockId=blk-1")).toEqual({
      type: "note",
      id: "abc",
      params: { blockId: "blk-1" }
    });
  });

  it("returns null for a non-nn protocol", () => {
    expect(parseInternalLink("https://example.com")).toBeNull();
    expect(parseInternalLink("http://note/abc")).toBeNull();
  });

  it("returns null for an unknown type", () => {
    expect(parseInternalLink("nn://tag/t-1")).toBeNull();
    expect(parseInternalLink("nn://archive/x")).toBeNull();
  });

  it("returns null for an empty or multi-segment id", () => {
    expect(parseInternalLink("nn://note/")).toBeNull();
    expect(parseInternalLink("nn://note/a/b")).toBeNull();
  });

  it("returns null for malformed / non-string input without throwing", () => {
    expect(parseInternalLink("not a url")).toBeNull();
    expect(parseInternalLink("")).toBeNull();
    expect(parseInternalLink(null)).toBeNull();
    expect(parseInternalLink(undefined)).toBeNull();
  });

  it("round-trips through createInternalLink", () => {
    const href = createInternalLink("note", "abc", { blockId: "blk-1" });
    const parsed = parseInternalLink(href);
    expect(parsed).toEqual({ type: "note", id: "abc", params: { blockId: "blk-1" } });
  });
});

describe("isInternalLink / isNoteLink", () => {
  it("isInternalLink matches any nn:// href", () => {
    expect(isInternalLink("nn://note/abc")).toBe(true);
    expect(isInternalLink("nn://notebook/nb-7")).toBe(true);
    expect(isInternalLink("https://x")).toBe(false);
    expect(isInternalLink(null)).toBe(false);
    expect(isInternalLink(undefined)).toBe(false);
  });

  it("isNoteLink matches only nn://note/", () => {
    expect(isNoteLink("nn://note/abc")).toBe(true);
    expect(isNoteLink("nn://note/abc?blockId=blk-1")).toBe(true);
    expect(isNoteLink("nn://notebook/nb-7")).toBe(false);
    expect(isNoteLink("https://x")).toBe(false);
  });
});

describe("noteIdFromLink / blockIdFromLink", () => {
  it("extracts the note id", () => {
    expect(noteIdFromLink("nn://note/abc")).toBe("abc");
    expect(noteIdFromLink("nn://note/abc?blockId=blk-1")).toBe("abc");
  });

  it("extracts the block id when present, null otherwise", () => {
    expect(blockIdFromLink("nn://note/abc?blockId=blk-1")).toBe("blk-1");
    expect(blockIdFromLink("nn://note/abc")).toBeNull();
  });

  it("return null for non-note links", () => {
    expect(noteIdFromLink("nn://notebook/nb-7")).toBeNull();
    expect(blockIdFromLink("nn://notebook/nb-7")).toBeNull();
    expect(noteIdFromLink("https://x")).toBeNull();
  });
});

it("NN_PROTOCOL is the bare protocol string", () => {
  expect(NN_PROTOCOL).toBe("nn");
});