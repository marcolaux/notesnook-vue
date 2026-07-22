// @vitest-environment happy-dom
/**
 * Tests for the custom `#` suggestion finder (`findTagSuggestionMatch`). The
 * default `@tiptap/suggestion` finder matches `#` with an EMPTY query when the
 * user types `# ` (hash + space), which collides with StarterKit's markdown
 * heading input rule (`# ` → H1). Our finder requires ≥1 non-space char after
 * `#` so `# ` does NOT open the picker (the heading input rule wins) while
 * `#` + letter does.
 */
import { describe, it, expect, afterAll } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TagMention, TagSuggest, findTagSuggestionMatch } from "@notesnook-vue/editor-vue";

const editor = new Editor({
  element: document.createElement("div"),
  extensions: [StarterKit.configure({ codeBlock: false }), TagMention, TagSuggest],
  content: "<p></p>"
});
afterAll(() => editor.destroy());

/** Build a paragraph with `text`, resolve the end-of-text position, and run
 *  the finder with the same config `TagSuggest` uses. */
function matchFor(text: string) {
  editor.chain().setContent(`<p>${text}</p>`).run();
  const doc = editor.state.doc;
  // position at the end of the paragraph's text content (inside the <p>)
  const $position = doc.resolve(doc.content.size - 1);
  return findTagSuggestionMatch({
    char: "#",
    allowSpaces: false,
    allowedPrefixes: null,
    startOfLine: false,
    $position
  });
}

describe("findTagSuggestionMatch (≥1 non-space char after #)", () => {
  it("`# ` (hash + space) does NOT match → heading input rule wins", () => {
    expect(matchFor("# ")).toBeNull();
  });

  it("bare `#` (nothing after) does NOT match", () => {
    expect(matchFor("#")).toBeNull();
  });

  it("`#work` matches with query 'work'", () => {
    const m = matchFor("#work");
    expect(m).not.toBeNull();
    expect(m?.query).toBe("work");
    expect(m?.text).toBe("#work");
  });

  it("`#w` (single letter) matches with query 'w'", () => {
    expect(matchFor("#w")?.query).toBe("w");
  });

  it("`#multi word` (caret past the space) → no match (picker closed)", () => {
    // Once the caret moves past the space, the `#multi` token no longer spans
    // the caret, so the picker closes — `allowSpaces:false` ends the query at
    // the first space. (While the caret is still within `#multi`, the match is
    // active; that's the `#multi`-alone case below.)
    expect(matchFor("#multi word")).toBeNull();
  });

  it("`#multi` (caret at end of token) matches with query 'multi'", () => {
    expect(matchFor("#multi")?.query).toBe("multi");
  });

  it("mid-paragraph `hello #world` matches the `#world` part", () => {
    const m = matchFor("hello #world");
    expect(m?.query).toBe("world");
  });

  it("start-of-line `#heading` matches (still a tag, not a heading — no space)", () => {
    // `#heading` has no space, so the heading input rule won't fire; the
    // picker should open. (`# heading` with a space would be the H1 case.)
    expect(matchFor("#heading")?.query).toBe("heading");
  });

  it("`# heading` (hash + space + word) does NOT match", () => {
    // The first `#` is followed by a space → no match. This is the H1 case.
    expect(matchFor("# heading")).toBeNull();
  });
});