// @vitest-environment happy-dom
import { describe, it, expect, afterAll } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Heading } from "@notesnook-vue/editor-vue";
import {
  findCollapsedRanges,
  buildHeadingCollapseDecorations
} from "../../packages/editor-vue/src/extensions/heading/collapse-plugin";

function createTestEditor(content = ""): Editor {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return new Editor({
    element: container,
    extensions: [
      StarterKit.configure({ codeBlock: false, heading: false }),
      Heading.configure({ levels: [1, 2, 3, 4, 5, 6] })
    ],
    content
  });
}

describe("Collapsible Headings Contract Tests", () => {
  let editor: Editor | null = null;

  afterAll(() => {
    if (editor) {
      editor.destroy();
    }
  });

  it("parses data-collapsed='true' from HTML and serializes it", () => {
    editor = createTestEditor('<h2 data-collapsed="true">Section Title</h2>');
    const html = editor.getHTML();
    expect(html).toContain('data-collapsed="true"');
    expect(editor.state.doc.firstChild?.attrs.collapsed).toBe(true);
  });

  it("toggleHeadingCollapse command toggles collapsed attribute", () => {
    editor = createTestEditor("<h2>Section 1</h2><p>Content</p>");
    editor.chain().focus().setTextSelection(3).run();

    expect(editor.state.doc.firstChild?.attrs.collapsed).toBe(false);

    editor.commands.toggleHeadingCollapse();
    expect(editor.state.doc.firstChild?.attrs.collapsed).toBe(true);

    editor.commands.toggleHeadingCollapse();
    expect(editor.state.doc.firstChild?.attrs.collapsed).toBe(false);
  });

  it("collapseHeading and expandHeading set explicit states", () => {
    editor = createTestEditor("<h2>Section 1</h2><p>Content</p>");
    editor.chain().focus().setTextSelection(3).run();

    editor.commands.collapseHeading();
    expect(editor.state.doc.firstChild?.attrs.collapsed).toBe(true);

    editor.commands.expandHeading();
    expect(editor.state.doc.firstChild?.attrs.collapsed).toBe(false);
  });

  it("findCollapsedRanges correctly identifies range until next same/higher level heading", () => {
    editor = createTestEditor(
      '<h2 data-collapsed="true">H2 Section 1</h2><p>P1</p><h3>H3 Sub</h3><p>P2</p><h2>H2 Section 2</h2><p>P3</p>'
    );
    const ranges = findCollapsedRanges(editor.state.doc);
    expect(ranges.length).toBe(1);

    // Range should cover P1, H3 Sub, P2 (stopping at H2 Section 2)
    const collapsedRange = ranges[0]!;
    expect(collapsedRange.headingNode.textContent).toBe("H2 Section 1");

    const decorations = buildHeadingCollapseDecorations(editor.state.doc);
    const hiddenNodes = decorations.find();
    // 3 block nodes inside H2 Section 1 (P1, H3 Sub, P2) should be decorated
    expect(hiddenNodes.length).toBe(3);

    // Verify H2 Section 2 (pos of 2nd H2) and P3 are NOT decorated/hidden
    const decPositions = hiddenNodes.map((d) => d.from);
    // Pos of H2 Section 2 in doc is after P2
    let section2Pos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading" && node.textContent === "H2 Section 2") {
        section2Pos = pos;
      }
    });
    expect(decPositions.includes(section2Pos)).toBe(false);
  });

  it("collapseAllHeadings and expandAllHeadings operate document-wide", () => {
    editor = createTestEditor(
      "<h2>H2 One</h2><p>P1</p><h2>H2 Two</h2><p>P2</p>"
    );
    editor.commands.collapseAllHeadings();

    editor.state.doc.descendants((node) => {
      if (node.type.name === "heading") {
        expect(node.attrs.collapsed).toBe(true);
      }
    });

    editor.commands.expandAllHeadings();
    editor.state.doc.descendants((node) => {
      if (node.type.name === "heading") {
        expect(node.attrs.collapsed).toBe(false);
      }
    });
  });

  it("HTML roundtrip preserves content under collapsed headings", () => {
    const originalHtml =
      '<h2 data-collapsed="true">Main Section</h2><p>Hidden Paragraph 1</p><p>Hidden Paragraph 2</p><h2>Next Section</h2><p>Visible Paragraph</p>';
    editor = createTestEditor(originalHtml);

    const serializedHtml = editor.getHTML();
    expect(serializedHtml).toContain("Hidden Paragraph 1");
    expect(serializedHtml).toContain("Hidden Paragraph 2");
    expect(serializedHtml).toContain('data-collapsed="true"');
  });
});
