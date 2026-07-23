// @vitest-environment happy-dom
/* Reproduce the live Editor.vue extension set to find what blocks `@`/`[[`. */
import { describe, it, expect, afterAll } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  AttachmentNode,
  TaskListNode,
  TaskItemNode,
  EmbedNode,
  ImageNode,
  CodeBlock,
  Underline,
  Highlight,
  Subscript,
  Superscript,
  TextStyle,
  FontFamily,
  Color,
  TextAlign,
  Table,
  TableRow,
  TableCell,
  TableHeader,
  SlashCommands,
  FindReplace,
  TagMention,
  TagSuggest,
  Link,
  NoteSuggest
} from "@notesnook-vue/editor-vue";

const editor = new Editor({
  element: document.createElement("div"),
  extensions: [
    StarterKit.configure({ codeBlock: false }),
    AttachmentNode,
    TaskListNode,
    TaskItemNode.configure({ nested: true }),
    EmbedNode,
    ImageNode,
    CodeBlock,
    Underline,
    Highlight.configure({ multicolor: true }),
    Subscript,
    Superscript,
    TextStyle,
    FontFamily,
    Color,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Table.configure({ resizable: true, showResizeHandleOnSelection: true }),
    TableRow,
    TableCell,
    TableHeader,
    SlashCommands,
    FindReplace,
    TagMention,
    TagSuggest,
    Link,
    NoteSuggest
  ],
  content: "<p></p>"
});
afterAll(() => editor.destroy());

(editor.storage as Record<string, unknown>).getNoteSuggestions = () => [
  { id: "n1", title: "Note one" }
];
(editor.storage as Record<string, unknown>).getContentBlocks = async () => [];

function afterType(text: string): { deco: boolean; popup: boolean } {
  editor.chain().focus().setContent("<p></p>").run();
  editor.chain().insertContent(text).run();
  return {
    deco: !!editor.view.dom.querySelector("[data-decoration-id]"),
    popup: !!document.body.querySelector(".nl-menu")
  };
}

describe("NoteSuggest in the FULL live extension set", () => {
  it("`@` + letter activates the suggestion", () => {
    const r = afterType("@w");
    expect(r.deco, "decoration missing").toBe(true);
  });
  it("`[[` + letter activates the suggestion", () => {
    const r = afterType("[[w");
    expect(r.deco, "decoration missing").toBe(true);
  });
  it("the NoteLinkPicker popup mounts on `@`", async () => {
    editor.chain().focus().setContent("<p></p>").run();
    editor.chain().insertContent("@w").run();
    await new Promise((r) => setTimeout(r, 10));
    expect(document.body.querySelector(".nl-menu"), "popup missing").not.toBeNull();
  });
});