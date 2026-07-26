// @vitest-environment happy-dom
import { describe, it, expect, afterAll } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Details, DetailsSummary, DetailsContent } from "@notesnook-vue/editor-vue";

function createTestEditor(content = ""): Editor {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return new Editor({
    element: container,
    extensions: [
      StarterKit,
      Details,
      DetailsSummary,
      DetailsContent
    ],
    content
  });
}

describe("Collapsible Details Toggle Contract Tests", () => {
  let editor: Editor | null = null;

  afterAll(() => {
    if (editor) {
      editor.destroy();
    }
  });

  it("parses <details> HTML and serializes it", () => {
    const htmlInput =
      '<details open=""><summary>Toggle Title</summary><div data-type="details-content"><p>Inner text content</p></div></details>';
    editor = createTestEditor(htmlInput);

    const serializedHtml = editor.getHTML();
    expect(serializedHtml).toContain("<details");
    expect(serializedHtml).toContain("<summary>Toggle Title</summary>");
    expect(serializedHtml).toContain("Inner text content");
  });

  it("setDetails command inserts a details toggle block", () => {
    editor = createTestEditor("<p>Start</p>");
    editor.chain().focus().setTextSelection(1).run();

    editor.commands.setDetails();

    const html = editor.getHTML();
    expect(html).toContain("<details");
    expect(html).toContain("<summary>");
    expect(html).toContain('data-type="details-content"');
  });

  it("toggleDetails command toggles open attribute", () => {
    editor = createTestEditor(
      '<details open=""><summary>Title</summary><div data-type="details-content"><p>Text</p></div></details>'
    );
    // Focus inside details (pos 3 inside summary)
    editor.chain().focus().setTextSelection(3).run();

    expect(editor.state.doc.firstChild?.attrs.open).toBe(true);

    editor.commands.toggleDetails();
    expect(editor.state.doc.firstChild?.attrs.open).toBe(false);

    editor.commands.toggleDetails();
    expect(editor.state.doc.firstChild?.attrs.open).toBe(true);
  });

  it("detailsContent container preserves nested block elements", () => {
    const htmlInput =
      '<details open=""><summary>Nested Content</summary><div data-type="details-content"><ul><li>Item 1</li><li>Item 2</li></ul></div></details>';
    editor = createTestEditor(htmlInput);

    const serializedHtml = editor.getHTML();
    expect(serializedHtml).toContain("<ul>");
    expect(serializedHtml).toContain("Item 1");
    expect(serializedHtml).toContain("Item 2");
  });
});
