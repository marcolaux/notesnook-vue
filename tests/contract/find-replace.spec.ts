// @vitest-environment happy-dom
/**
 * Contract tests for the per-tab in-content Find & Replace extension.
 *
 * Two layers:
 *  1. Pure matcher (`buildTextMap` / `findMatches`) — ranges, case/regex,
 *     invalid-regex fallback, cross-paragraph rejection, zero-length guard.
 *     Driven against a real ProseMirror doc built by a throwaway `Editor`.
 *  2. Extension commands (`setFind`/`findNext`/`findPrev`/`replace`/`replaceAll`)
 *     through a live `Editor` instance, asserting content + the plugin's live
 *     match state via `findReplacePluginKey`.
 *
 * happy-dom is required because `new Editor` needs a `document` (mirrors
 * `editor-html.spec.ts`); the rest of the contract suite stays in `node`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Editor } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import {
  FindReplace,
  findReplacePluginKey,
  findMatches,
  buildTextMap
} from "@notesnook-vue/editor-vue";

function makeEditor(): Editor {
  return new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, FindReplace],
    content: ""
  });
}

function state(ed: Editor) {
  return findReplacePluginKey.getState(ed.state)!;
}

describe("findMatches (pure matcher)", () => {
  let editor: Editor;
  beforeEach(() => {
    editor = makeEditor();
    editor.commands.setContent("<p>Hello world</p><p>foo bar foo</p>");
  });
  afterEach(() => editor.destroy());

  it("returns correct ranges for a substring across paragraphs", () => {
    const doc = editor.state.doc;
    const matches = findMatches(doc, "foo", {});
    expect(matches).toHaveLength(2);
    // Both ranges are inside the second paragraph and contain "foo".
    for (const m of matches) {
      expect(doc.textBetween(m.from, m.to, "\n")).toBe("foo");
    }
  });

  it("is case-insensitive by default and case-sensitive when asked", () => {
    const doc = editor.state.doc;
    expect(findMatches(doc, "FOO", {})).toHaveLength(2);
    expect(findMatches(doc, "FOO", { caseSensitive: true })).toHaveLength(0);
    expect(findMatches(doc, "foo", { caseSensitive: true })).toHaveLength(2);
  });

  it("supports regex mode", () => {
    const doc = editor.state.doc;
    // `l+` matches "ll" in "Hello" and "l" in "world" (two runs).
    const matches = findMatches(doc, "l+", { regexp: true });
    expect(matches).toHaveLength(2);
    expect(doc.textBetween(matches[0]!.from, matches[0]!.to, "\n")).toBe("ll");
    expect(doc.textBetween(matches[1]!.from, matches[1]!.to, "\n")).toBe("l");
  });

  it("returns [] for an invalid regex (no throw)", () => {
    const doc = editor.state.doc;
    expect(findMatches(doc, "(foo", { regexp: true })).toEqual([]);
  });

  it("returns [] for an empty query", () => {
    expect(findMatches(editor.state.doc, "", {})).toEqual([]);
  });

  it("rejects matches that cross a paragraph boundary", () => {
    editor.commands.setContent("<p>ab</p><p>cd</p>");
    const doc = editor.state.doc;
    // text is "ab\ncd"; a query that would match across the separator yields nothing.
    expect(findMatches(doc, "b\nc", {})).toEqual([]);
    // A regex matching across the boundary via an explicit newline also fails.
    expect(findMatches(doc, "b\\nc", { regexp: true })).toEqual([]);
  });

  it("handles zero-length regex matches without looping forever", () => {
    editor.commands.setContent("<p>baaab</p>");
    const doc = editor.state.doc;
    const matches = findMatches(doc, "a*", { regexp: true });
    // Only the non-empty "aaa" run is surfaced.
    expect(matches).toHaveLength(1);
    expect(doc.textBetween(matches[0]!.from, matches[0]!.to, "\n")).toBe("aaa");
  });

  it("buildTextMap records absolute doc positions and a -1 separator", () => {
    editor.commands.setContent("<p>ab</p><p>cd</p>");
    const { text, posOf } = buildTextMap(editor.state.doc);
    expect(text).toBe("ab\ncd");
    // First paragraph chars have valid positions; the separator is -1.
    expect(posOf[0]).toBeGreaterThan(0);
    expect(posOf[2]).toBe(-1);
  });
});

describe("FindReplace extension commands", () => {
  let editor: Editor;
  beforeEach(() => {
    editor = makeEditor();
    editor.commands.setContent("<p>foo bar foo</p>");
  });
  afterEach(() => editor.destroy());

  it("setFind populates matches and resets to the first", () => {
    editor.commands.setFind("foo", {});
    const st = state(editor);
    expect(st.matches).toHaveLength(2);
    expect(st.currentIndex).toBe(0);
    expect(editor.state.doc.textBetween(st.matches[0]!.from, st.matches[0]!.to, "\n")).toBe("foo");
  });

  it("clearFind resets matches", () => {
    editor.commands.setFind("foo", {});
    expect(state(editor).matches).toHaveLength(2);
    editor.commands.clearFind();
    expect(state(editor).matches).toHaveLength(0);
    expect(state(editor).currentIndex).toBe(-1);
  });

  it("findNext / findPrev cycle the current match (wrap)", () => {
    editor.commands.setFind("foo", {});
    expect(state(editor).currentIndex).toBe(0);
    editor.commands.findNext();
    expect(state(editor).currentIndex).toBe(1);
    editor.commands.findNext();
    expect(state(editor).currentIndex).toBe(0); // wraps
    editor.commands.findPrev();
    expect(state(editor).currentIndex).toBe(1); // wraps back
  });

  it("replace replaces only the current match and advances", () => {
    editor.commands.setFind("foo", {});
    editor.commands.findNext(); // currentIndex = 1 (the second "foo")
    // Replace with a string that does NOT match the (case-insensitive) query,
    // so the only remaining match is the untouched first "foo".
    editor.commands.replace("XYZ");
    expect(editor.getHTML()).toContain("XYZ");
    expect(editor.getHTML()).toContain("foo bar");
    const remaining = state(editor).matches;
    expect(remaining).toHaveLength(1);
    expect(editor.state.doc.textBetween(remaining[0]!.from, remaining[0]!.to, "\n")).toBe("foo");
  });

  it("replaceAll replaces every match", () => {
    editor.commands.setFind("foo", {});
    editor.commands.replaceAll("X");
    expect(editor.getText()).toBe("X bar X");
    expect(state(editor).matches).toHaveLength(0);
  });

  it("recomputes matches after a content edit", () => {
    editor.commands.setFind("foo", {});
    expect(state(editor).matches).toHaveLength(2);
    // Insert another "foo" at the end of the paragraph.
    editor.commands.setContent("<p>foo bar foo foo</p>");
    expect(state(editor).matches).toHaveLength(3);
  });
});

describe("scrollEditorToMatch (global-search scroll hook)", () => {
  // Validates the renderer-side helper that consumes a pending scroll target
  // staged by the search store: it installs find-match decorations via setFind,
  // resolves the Nth match via findMatches, and sets a TextSelection + scrolls
  // (scrollIntoView is a no-op in happy-dom but the selection dispatch is real).
  // The selection dispatch is deferred to a requestAnimationFrame (the search
  // result opens a fresh editor; scrolling synchronously lands at zero before
  // layout), so these tests await one raf before asserting the selection.
  const nextRaf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  let editor: Editor;
  beforeEach(() => {
    editor = makeEditor();
    editor.commands.setContent("<p>Hello world</p><p>foo bar foo</p>");
  });
  afterEach(() => editor.destroy());

  it("selects the first match by default", async () => {
    const { scrollEditorToMatch } = await import("@/utils/search-scroll");
    scrollEditorToMatch(editor, "foo", 0);
    await nextRaf();
    const sel = editor.state.selection;
    expect(editor.state.doc.textBetween(sel.from, sel.to, "\n")).toBe("foo");
    // find-match decorations are installed by setFind (synchronous).
    expect(state(editor).matches.length).toBeGreaterThanOrEqual(2);
  });

  it("selects the Nth match when matchIndex is given", async () => {
    const { scrollEditorToMatch } = await import("@/utils/search-scroll");
    const matches = findMatches(editor.state.doc, "foo", {});
    expect(matches).toHaveLength(2);
    scrollEditorToMatch(editor, "foo", 1);
    await nextRaf();
    const sel = editor.state.selection;
    expect(sel.from).toBe(matches[1]!.from);
    expect(sel.to).toBe(matches[1]!.to);
  });

  it("clamps an out-of-range matchIndex to the last match", async () => {
    const { scrollEditorToMatch } = await import("@/utils/search-scroll");
    const matches = findMatches(editor.state.doc, "foo", {});
    scrollEditorToMatch(editor, "foo", 99);
    await nextRaf();
    const sel = editor.state.selection;
    expect(sel.from).toBe(matches[matches.length - 1]!.from);
  });

  it("is a no-op (no selection change) when the query is not found", async () => {
    const { scrollEditorToMatch } = await import("@/utils/search-scroll");
    const before = editor.state.selection.from;
    scrollEditorToMatch(editor, "zzz-not-present", 0);
    // No match → no raf scheduled + no TextSelection dispatched; selection
    // unchanged. (setFind still runs but does not move the selection.)
    expect(editor.state.selection.from).toBe(before);
  });
});