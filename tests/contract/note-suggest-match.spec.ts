// @vitest-environment node
import { describe, it, expect } from "vitest";
import { findNoteSuggestionMatch } from "@notesnook-vue/editor-vue";

/**
 * The finder reads only `$position.nodeBefore.text` + `$position.pos` (it
 * ignores `char` and the prefix/space gates). Mock a text-bearing node-before
 * at a cursor position so the regex + straddle check can be exercised without
 * a real ProseMirror doc. `pos` defaults to the end of the text (cursor at the
 * trailing edge, the common case while typing the trigger).
 */
function pos(text: string, cursor = text.length) {
  return {
    nodeBefore: { isText: true, text },
    pos: cursor
  };
}
// The finder ignores `char`; pass a nominal config cast to the Trigger shape.
function match(text: string, cursor = text.length) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return findNoteSuggestionMatch({ $position: pos(text, cursor), char: "@" } as any);
}

describe("findNoteSuggestionMatch (@ and [[)", () => {
  it("matches an @ trigger at the end of the text", () => {
    const m = match("foo @bar");
    expect(m).not.toBeNull();
    expect(m!.text).toBe("@bar");
    expect(m!.query).toBe("bar");
  });

  it("matches a [[ trigger at the end of the text", () => {
    const m = match("foo [[wiki");
    expect(m).not.toBeNull();
    expect(m!.text).toBe("[[wiki");
    expect(m!.query).toBe("wiki");
  });

  it("matches a bare `@` (empty query) — picker opens immediately", () => {
    const m = match("foo @");
    expect(m).not.toBeNull();
    expect(m!.text).toBe("@");
    expect(m!.query).toBe("");
  });

  it("matches a bare `[[` (empty query)", () => {
    const m = match("foo [[");
    expect(m).not.toBeNull();
    expect(m!.text).toBe("[[");
    expect(m!.query).toBe("");
  });

  it("matches bare `@` / `[[` at the start of the text too", () => {
    expect(match("@")!.query).toBe("");
    expect(match("[[")!.query).toBe("");
  });

  it("deactivates once the cursor moves past a trailing space", () => {
    // `@ ` / `[[ ` with the cursor at the very end (past the space) → no match.
    expect(match("foo @ ")).toBeNull();
    expect(match("foo [[ ")).toBeNull();
  });

  it("picks the match straddling the cursor (last match)", () => {
    const m = match("@alpha [[beta");
    // Both `@alpha` and `[[beta` match; the last one straddles the end cursor.
    expect(m!.text).toBe("[[beta");
    expect(m!.query).toBe("beta");
  });

  it("returns null when the cursor is after trailing text past the trigger", () => {
    // Cursor at the very end of `@foo bar` is past the `@foo` match → no match.
    expect(match("@foo bar")).toBeNull();
  });

  it("matches when the cursor sits just after the trigger text", () => {
    // `@foo` is 4 chars; cursor at pos 4 (end of `@foo`) straddles the match.
    const m = match("@foo", 4);
    expect(m).not.toBeNull();
    expect(m!.query).toBe("foo");
  });

  it("returns null when there is no text node before the cursor", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = findNoteSuggestionMatch({ $position: { nodeBefore: null, pos: 0 }, char: "@" } as any);
    expect(m).toBeNull();
  });

  it("range covers the trigger + query", () => {
    const m = match("ab [[note");
    expect(m).not.toBeNull();
    // text "ab [[note" → [[note at index 3, length 6 → from=3, to=9, pos=9.
    expect(m!.range.from).toBe(3);
    expect(m!.range.to).toBe(9);
  });
});