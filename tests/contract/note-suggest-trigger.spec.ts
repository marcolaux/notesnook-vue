// @vitest-environment happy-dom
/* Diagnostic: does typing `@` / `[[` activate the NoteSuggest Suggestion plugin? */
import { describe, it, expect, afterAll } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Link, NoteSuggest } from "@notesnook-vue/editor-vue";

const editor = new Editor({
  element: document.createElement("div"),
  extensions: [StarterKit.configure({ codeBlock: false }), Link, NoteSuggest],
  content: "<p></p>"
});
afterAll(() => editor.destroy());

// Inject the host hooks the bridge would, so items() returns something.
(editor.storage as Record<string, unknown>).getNoteSuggestions = (q: string) => [
  { id: "n1", title: "Note one" }
];
(editor.storage as Record<string, unknown>).getContentBlocks = async () => [];

/** Insert `text` at the end of the first paragraph and return whether a
 *  Suggestion decoration (`[data-decoration-id]`) is present — proof the
 *  Suggestion plugin matched the trigger and activated. */
function decorationPresentAfter(text: string): boolean {
  editor.chain().focus().setContent("<p></p>").run();
  editor.chain().insertContent(text).run();
  return !!editor.view.dom.querySelector("[data-decoration-id]");
}

describe("NoteSuggest trigger activation", () => {
  it("activates on `@` + a letter", () => {
    expect(decorationPresentAfter("@w")).toBe(true);
  });

  it("activates on `[[` + a letter", () => {
    expect(decorationPresentAfter("[[w")).toBe(true);
  });

  it("activates on a bare `@` (picker opens immediately, empty query)", () => {
    expect(decorationPresentAfter("@")).toBe(true);
  });

  it("activates on a bare `[[`", () => {
    expect(decorationPresentAfter("[[")).toBe(true);
  });

  it("does NOT activate on plain text", () => {
    expect(decorationPresentAfter("hello")).toBe(false);
  });

  it("mounts the NoteLinkPicker popup to <body> on `@` + letter", async () => {
    editor.chain().focus().setContent("<p></p>").run();
    editor.chain().insertContent("@w").run();
    // The Suggestion view.update is async (awaits items). Flush.
    await new Promise((r) => setTimeout(r, 10));
    const popup = document.body.querySelector(".nl-menu");
    expect(popup, "NoteLinkPicker popup should mount to <body> on @ trigger").not.toBeNull();
  });
});