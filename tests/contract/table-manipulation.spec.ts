// @vitest-environment happy-dom
import { describe, it, expect, afterAll } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  Table,
  TableRow,
  TableCell,
  TableHeader,
  moveRowUp,
  moveRowDown,
  moveColumnLeft,
  moveColumnRight
} from "@notesnook-vue/editor-vue";

function createTestEditor(content = ""): Editor {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return new Editor({
    element: container,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Table.configure({ resizable: true, showResizeHandleOnSelection: true }),
      TableRow,
      TableCell,
      TableHeader
    ],
    content
  });
}

describe("Table Manipulation Contract Tests", () => {
  let editor: Editor | null = null;

  afterAll(() => {
    if (editor) {
      editor.destroy();
    }
  });

  it("insertTable creates a 3x3 table by default", () => {
    editor = createTestEditor("<p>test</p>");
    editor.commands.focus();
    editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });

    expect(editor.isActive("table")).toBe(true);
    const html = editor.getHTML();
    expect(html).toContain("<table");
    expect(html.match(/<tr/g)?.length).toBe(3);
    expect(html.match(/<th/g)?.length).toBe(3);
    expect(html.match(/<td/g)?.length).toBe(6);
  });

  it("addRowBefore and addRowAfter modify row count", () => {
    editor = createTestEditor(
      "<table><tbody><tr><td>Row 1 Cell 1</td><td>Row 1 Cell 2</td></tr><tr><td>Row 2 Cell 1</td><td>Row 2 Cell 2</td></tr></tbody></table>"
    );
    // Focus in Row 1 Cell 1 (pos 4)
    editor.chain().focus().setTextSelection(4).run();

    editor.commands.addRowBefore();
    let html = editor.getHTML();
    expect(html.match(/<tr/g)?.length).toBe(3);

    editor.commands.addRowAfter();
    html = editor.getHTML();
    expect(html.match(/<tr/g)?.length).toBe(4);
  });

  it("deleteRow removes active row", () => {
    editor = createTestEditor(
      "<table><tbody><tr><td>A</td></tr><tr><td>B</td></tr><tr><td>C</td></tr></tbody></table>"
    );
    // Focus in middle row B (pos 13 is inside text B)
    editor.chain().focus().setTextSelection(13).run();
    editor.commands.deleteRow();

    const html = editor.getHTML();
    expect(html.match(/<tr/g)?.length).toBe(2);
    expect(html).not.toContain("B");
    expect(html).toContain("A");
    expect(html).toContain("C");
  });

  it("addColumnBefore and addColumnAfter add columns", () => {
    editor = createTestEditor(
      "<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>"
    );
    // Focus in Cell A (pos 4)
    editor.chain().focus().setTextSelection(4).run();

    editor.commands.addColumnBefore();
    let html = editor.getHTML();
    expect(html.match(/<td/g)?.length).toBe(3);

    editor.commands.addColumnAfter();
    html = editor.getHTML();
    expect(html.match(/<td/g)?.length).toBe(4);
  });

  it("deleteColumn removes active column", () => {
    editor = createTestEditor(
      "<table><tbody><tr><td>A</td><td>B</td><td>C</td></tr></tbody></table>"
    );
    // Focus in Cell B (pos 11 is inside text B)
    editor.chain().focus().setTextSelection(11).run();
    editor.commands.deleteColumn();

    const html = editor.getHTML();
    expect(html.match(/<td/g)?.length).toBe(2);
    expect(html).not.toContain("B");
  });

  it("moveRowDown and moveRowUp reorder table rows", () => {
    editor = createTestEditor(
      "<table><tbody><tr><td>First</td></tr><tr><td>Second</td></tr><tr><td>Third</td></tr></tbody></table>"
    );
    // Focus in First row (pos 4 inside paragraph)
    editor.chain().focus().setTextSelection(4).run();

    moveRowDown(editor);
    let html = editor.getHTML();
    // First row should now be Second, then First, then Third
    let rows = html.match(/<td[^>]*>(.*?)<\/td>/g);
    expect(rows?.[0]).toContain("Second");
    expect(rows?.[1]).toContain("First");

    moveRowUp(editor);
    html = editor.getHTML();
    rows = html.match(/<td[^>]*>(.*?)<\/td>/g);
    expect(rows?.[0]).toContain("First");
    expect(rows?.[1]).toContain("Second");
  });

  it("moveColumnRight and moveColumnLeft reorder table columns", () => {
    editor = createTestEditor(
      "<table><tbody><tr><td>Col1</td><td>Col2</td><td>Col3</td></tr></tbody></table>"
    );
    // Focus in Col1 (pos 4 inside paragraph)
    editor.chain().focus().setTextSelection(4).run();

    moveColumnRight(editor);
    let html = editor.getHTML();
    let cols = html.match(/<td[^>]*>(.*?)<\/td>/g);
    expect(cols?.[0]).toContain("Col2");
    expect(cols?.[1]).toContain("Col1");

    moveColumnLeft(editor);
    html = editor.getHTML();
    cols = html.match(/<td[^>]*>(.*?)<\/td>/g);
    expect(cols?.[0]).toContain("Col1");
    expect(cols?.[1]).toContain("Col2");
  });

  it("toggleHeaderRow and toggleHeaderColumn toggle th/td node types", () => {
    editor = createTestEditor(
      "<table><tbody><tr><td>Header 1</td><td>Header 2</td></tr><tr><td>Data 1</td><td>Data 2</td></tr></tbody></table>"
    );
    editor.chain().focus().setTextSelection(4).run();

    editor.commands.toggleHeaderRow();
    let html = editor.getHTML();
    expect(html).toContain("<th");

    editor.commands.toggleHeaderRow();
    html = editor.getHTML();
    expect(html).not.toContain("<th");
  });

  it("mergeCells and splitCell handle cell spanning", () => {
    editor = createTestEditor(
      "<table><tbody><tr><td>Cell 1</td><td>Cell 2</td></tr><tr><td>Cell 3</td><td>Cell 4</td></tr></tbody></table>"
    );
    // Position 2 is before Cell 1, position 12 is before Cell 2
    editor.commands.setCellSelection({ anchorCell: 2, headCell: 12 });

    editor.commands.mergeCells();
    let html = editor.getHTML();
    expect(html).toContain('colspan="2"');

    editor.commands.splitCell();
    html = editor.getHTML();
    expect(html).not.toContain('colspan="2"');
  });

  it("setCellAttribute sets cell background color and border styles", () => {
    editor = createTestEditor(
      "<table><tbody><tr><td>Cell</td></tr></tbody></table>"
    );
    editor.chain().focus().setTextSelection(4).run();

    editor.commands.setCellAttribute("backgroundColor", "#ff0000");
    editor.commands.setCellAttribute("borderWidth", 2);
    editor.commands.setCellAttribute("borderStyle", "dashed");

    const html = editor.getHTML();
    expect(html).toContain("background-color: #ff0000");
    expect(html).toContain("border-width: 2px");
    expect(html).toContain("border-style: dashed");
  });

  it("deleteTable removes the entire table node", () => {
    editor = createTestEditor(
      "<p>before</p><table><tbody><tr><td>Cell</td></tr></tbody></table><p>after</p>"
    );
    // Focus inside cell text
    editor.chain().focus().setTextSelection(14).run();

    editor.commands.deleteTable();
    const html = editor.getHTML();
    expect(html).not.toContain("<table");
    expect(html).toContain("before");
    expect(html).toContain("after");
  });
});
