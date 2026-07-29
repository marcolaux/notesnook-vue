// @vitest-environment happy-dom
/**
 * Contract test for the `toggleChecklistItem` command (`task-list.ts`):
 *  - converts the INNERMOST bullet / ordered / outline list containing the
 *    caret into a simple checklist IN PLACE (atomically rebuilt as a
 *    `checkList`/`checkListItem` subtree — per-node `setNodeMarkup` can't do
 *    this, see the command comment), without lifting items out of their
 *    parent;
 *  - flips `checked` when the caret is already inside a check item;
 *  - wraps a plain paragraph in a new simple checklist otherwise.
 *
 * Mirrors Editor.vue's extension set so the schema (groups, content models)
 * matches the real editor.
 */
import { describe, it, expect, afterAll } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  TaskItemNode,
  TaskListNode,
  CheckListItemNode,
  CheckListNode,
  CollapsibleBulletList,
  CollapsibleOrderedList,
  CollapsibleListItem,
  OutlineList,
  OutlineListItem
} from "@notesnook-vue/editor-vue";

const editor = new Editor({
  element: document.createElement("div"),
  extensions: [
    StarterKit.configure({
      codeBlock: false,
      bulletList: false,
      orderedList: false,
      listItem: false
    }),
    CollapsibleBulletList,
    CollapsibleOrderedList,
    CollapsibleListItem,
    OutlineList,
    OutlineListItem,
    TaskListNode,
    TaskItemNode.configure({ nested: true }),
    CheckListNode,
    CheckListItemNode.configure({ nested: true })
  ],
  content: ""
});

afterAll(() => editor.destroy());

/** Place the caret inside the first text node containing `text` (a real doc
 *  position, not an HTML-string index). */
function setSelectionInText(text: string): void {
  let pos = -1;
  editor.state.doc.descendants((node, p) => {
    if (node.isText && node.text?.includes(text)) {
      pos = p + node.text.indexOf(text);
      return false;
    }
    return true;
  });
  if (pos < 0) throw new Error(`text "${text}" not found in doc`);
  editor.commands.setTextSelection(pos + 1);
}

describe("toggleChecklistItem", () => {
  it("converts a flat bullet list into a simple checklist in place", () => {
    editor.commands.setContent("<ul><li><p>One</p></li><li><p>Two</p></li><li><p>Three</p></li></ul>");
    setSelectionInText("Two");
    expect(editor.commands.toggleChecklistItem()).toBe(true);
    const html = editor.getHTML();
    expect(html).toContain("simple-checklist");
    expect(html).toContain("One");
    expect(html).toContain("Two");
    expect(html).toContain("Three");
    expect(html).not.toContain("<ul><li");
  });

  it("converts an ordered list into a simple checklist", () => {
    editor.commands.setContent("<ol><li><p>First</p></li><li><p>Second</p></li></ol>");
    setSelectionInText("Second");
    expect(editor.commands.toggleChecklistItem()).toBe(true);
    const html = editor.getHTML();
    expect(html).toContain("simple-checklist");
    expect(html).not.toContain("<ol>");
  });

  it("converts an outline list into a simple checklist", () => {
    editor.commands.setContent(
      '<ul data-type="outlineList"><li><p>Alpha</p></li><li><p>Beta</p></li></ul>'
    );
    setSelectionInText("Beta");
    expect(editor.commands.toggleChecklistItem()).toBe(true);
    const html = editor.getHTML();
    expect(html).toContain("simple-checklist");
    expect(html).toContain("Beta");
  });

  it("converts only the innermost list (outer bullet list stays)", () => {
    editor.commands.setContent(
      "<ul><li><p>Top</p><ul><li><p>Child A</p></li><li><p>Child B</p></li></ul></li><li><p>Top2</p></li></ul>"
    );
    setSelectionInText("Child A");
    expect(editor.commands.toggleChecklistItem()).toBe(true);
    const html = editor.getHTML();
    // The inner list the caret is in becomes a simple checklist…
    expect(html).toContain("simple-checklist");
    expect(html).toContain("Child A");
    expect(html).toContain("Child B");
    // …while the outer bullet list (Top/Top2) is untouched.
    expect(html).toContain("Top2");
    expect(html).toMatch(/<ul><li><p>Top<\/p>/);
  });

  it("leaves nested children as bullets when toggling a parent item", () => {
    // Caret on the parent item (Top), which has nested children. Only the
    // parent's level converts to a simple checklist; the nested list inside
    // the parent stays a bullet list (the children do NOT become check items).
    editor.commands.setContent(
      "<ul><li><p>Top</p><ul><li><p>Child A</p></li><li><p>Child B</p></li></ul></li><li><p>Top2</p></li></ul>"
    );
    setSelectionInText("Top");
    expect(editor.commands.toggleChecklistItem()).toBe(true);
    const html = editor.getHTML();
    // The outer list becomes a simple checklist…
    expect(html).toContain("simple-checklist");
    expect(html).toContain("Top");
    expect(html).toContain("Top2");
    // …but the nested children stay as a bullet list, NOT a simple-checklist
    // hierarchy: the Child A/Child B rows must NOT be check items.
    expect(html).toContain("Child A");
    expect(html).toContain("Child B");
    // The nested bullet list survives: exactly one `<ul class="simple-
    // checklist">` container (the outer), and one nested plain `<ul>` for
    // the children. (Don't count `simple-checklist--item` class strings.)
    expect(html.match(/<ul class="simple-checklist">/g)?.length).toBe(1);
    expect(html).toMatch(/<ul><li><p>Child A<\/p>/);
  });

  it("flips checked when already inside a check item", () => {
    editor.commands.setContent(
      '<ul class="simple-checklist"><li class="simple-checklist--item"><p>One</p></li><li class="simple-checklist--item"><p>Two</p></li></ul>'
    );
    setSelectionInText("Two");
    editor.commands.toggleChecklistItem();
    const html = editor.getHTML();
    // The "Two" item gains the `checked` class (rendered before or after
    // `simple-checklist--item` depending on attribute merge order).
    expect(html).toMatch(
      /<li class="(?:[^"]*\b)?checked\b[^"]*simple-checklist--item"|<li class="[^"]*simple-checklist--item[^"]*\bchecked\b/
    );
    expect(html).toContain("Two");
  });

  it("wraps a plain paragraph in a new simple checklist", () => {
    editor.commands.setContent("<p>Just a paragraph</p>");
    editor.commands.setTextSelection(1);
    expect(editor.commands.toggleChecklistItem()).toBe(true);
    const html = editor.getHTML();
    expect(html).toContain("simple-checklist");
    expect(html).toContain("Just a paragraph");
  });

  it("leaves the caret in the converted item (not the next line)", () => {
    editor.commands.setContent("<ul><li><p>One</p></li><li><p>Two</p></li><li><p>Three</p></li></ul>");
    setSelectionInText("Two");
    editor.commands.toggleChecklistItem();
    // The caret must still be in the "Two" item after the in-place conversion.
    const { $from } = editor.state.selection;
    let itemText: string | null = null;
    for (let d = $from.depth; d > 0; d--) {
      const n = $from.node(d);
      if (n.type.name === "listItem" || n.type.name === "checkListItem") {
        itemText = n.textContent;
        break;
      }
    }
    expect(itemText).toBe("Two");
  });
});