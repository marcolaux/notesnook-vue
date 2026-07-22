// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import {
  htmlToLines,
  diffLines,
  diffHtml,
  type DiffLine
} from "@/utils/note-history-diff";

describe("htmlToLines", () => {
  it("returns [] for empty / non-string input", () => {
    expect(htmlToLines("")).toEqual([]);
    expect(htmlToLines("   ")).toEqual([]);
  });

  it("extracts one trimmed line per block element, dropping empties", () => {
    const html = "<h1>Title</h1><p>First paragraph.</p><p>  </p><p>Second.</p>";
    expect(htmlToLines(html)).toEqual(["Title", "First paragraph.", "Second."]);
  });

  it("collapses internal whitespace in a line", () => {
    expect(htmlToLines("<p>hello    world\tline</p>")).toEqual(["hello world line"]);
  });

  it("extracts list items and quotes", () => {
    const html = "<ul><li>one</li><li>two</li></ul><blockquote>quoted</blockquote>";
    expect(htmlToLines(html)).toEqual(["one", "two", "quoted"]);
  });

  it("falls back to body text split on newlines when there are no block elements", () => {
    expect(htmlToLines("plain\ntext\nhere")).toEqual(["plain", "text", "here"]);
  });
});

describe("diffLines", () => {
  it("returns all-add when a is empty", () => {
    const d = diffLines([], ["a", "b"]);
    expect(d).toEqual<DiffLine[]>([
      { type: "add", text: "a" },
      { type: "add", text: "b" }
    ]);
  });

  it("returns all-del when b is empty", () => {
    const d = diffLines(["a", "b"], []);
    expect(d).toEqual<DiffLine[]>([
      { type: "del", text: "a" },
      { type: "del", text: "b" }
    ]);
  });

  it("returns all-ctx when a === b", () => {
    const d = diffLines(["x", "y"], ["x", "y"]);
    expect(d).toEqual<DiffLine[]>([
      { type: "ctx", text: "x" },
      { type: "ctx", text: "y" }
    ]);
  });

  it("marks an insertion as add and a deletion as del", () => {
    const a = ["one", "two", "three"];
    const b = ["one", "two", "three", "four"];
    const d = diffLines(a, b);
    expect(d).toContainEqual({ type: "add", text: "four" });
    expect(d.find((l) => l.type === "del")).toBeUndefined();
  });

  it("marks a middle edit as del + add", () => {
    const a = ["one", "two", "three"];
    const b = ["one", "TWO", "three"];
    const d = diffLines(a, b);
    expect(d).toEqual<DiffLine[]>([
      { type: "ctx", text: "one" },
      { type: "del", text: "two" },
      { type: "add", text: "TWO" },
      { type: "ctx", text: "three" }
    ]);
  });

  it("treats a reorder as del + add of the moved line (LCS keeps the rest)", () => {
    const a = ["a", "b", "c"];
    const b = ["c", "a", "b"];
    const d = diffLines(a, b);
    // LCS = [a, b]; "c" moved → one add (new front) + one del (old tail).
    expect(d).toEqual<DiffLine[]>([
      { type: "add", text: "c" },
      { type: "ctx", text: "a" },
      { type: "ctx", text: "b" },
      { type: "del", text: "c" }
    ]);
  });
});

describe("diffHtml", () => {
  it("diffs two HTML bodies as lines", () => {
    const prev = "<p>one</p><p>two</p>";
    const curr = "<p>one</p><p>two</p><p>three</p>";
    const d = diffHtml(prev, curr);
    expect(d).toContainEqual({ type: "add", text: "three" });
    expect(d.filter((l) => l.type === "ctx").map((l) => l.text)).toEqual(["one", "two"]);
  });

  it("treats an empty prev as the initial version (all-add)", () => {
    const d = diffHtml("", "<p>first</p><p>second</p>");
    expect(d).toEqual<DiffLine[]>([
      { type: "add", text: "first" },
      { type: "add", text: "second" }
    ]);
  });
});