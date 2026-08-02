// @vitest-environment happy-dom
import { describe, it, expect, afterAll } from "vitest";
import { Editor } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import {
  OutlineList,
  OutlineListItem,
  EDITOR_ACTION_BY_ID,
  setLastSelectedListType,
  getLastSelectedListType
} from "@notesnook-vue/editor-vue";

describe("Upstream Outline List Contract & Grouped Toolbar Button Tests", () => {
  // Track every editor we spin up so we can destroy them in afterAll. A live
  // prosemirror EditorView keeps a DOMObserver flush timer running; if it
  // fires after happy-dom tears down the environment it throws
  // `ReferenceError: document is not defined`, which Vitest reports as an
  // unhandled error and exits non-zero (breaks CI even with all tests green).
  const editors: Editor[] = [];

  afterAll(() => {
    for (const editor of editors) {
      editor.destroy();
    }
    editors.length = 0;
  });

  function createTestEditor(content = "") {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [
        StarterKit.configure({ codeBlock: false }),
        OutlineList,
        OutlineListItem
      ],
      content
    });
    editors.push(editor);
    return editor;
  }

  it("parses <ul data-type='outlineList'> HTML and serializes it accurately", () => {
    const inputHtml =
      '<ul data-type="outlineList" data-collapsed="false"><li data-type="outlineListItem"><p>Parent outline item</p><ul data-type="outlineList" data-collapsed="true"><li data-type="outlineListItem"><p>Nested collapsed item</p></li></ul></li></ul>';
    const editor = createTestEditor(inputHtml);

    const serializedHtml = editor.getHTML();
    expect(serializedHtml).toContain('data-type="outlineList"');
    expect(serializedHtml).toContain('data-type="outlineListItem"');
    expect(serializedHtml).toContain('data-collapsed="true"');
  });

  it("toggleOutlineList command creates and toggles outline list", () => {
    const editor = createTestEditor("<p>Hello world</p>");

    editor.commands.focus("start");
    editor.commands.toggleOutlineList();

    const html = editor.getHTML();
    expect(html).toContain('data-type="outlineList"');
    expect(html).toContain('data-type="outlineListItem"');
    expect(html).toContain("Hello world");
  });

  it("grouped lists action in tool-definitions tracks last selected list selection", () => {
    const listsAction = EDITOR_ACTION_BY_ID.get("lists");
    expect(listsAction).toBeDefined();
    expect(listsAction?.kind).toBe("dropdown");

    const editor = createTestEditor("<p>Item 1</p>");
    editor.commands.focus("start");

    // Default selection
    setLastSelectedListType("bulletList");
    expect(getLastSelectedListType()).toBe("bulletList");

    // Select outlineList from lists menu
    const menuItems = listsAction?.menu?.(editor);
    expect(menuItems).toBeDefined();
    const outlineOption = menuItems?.find((i) => i.id === "list-outline");
    expect(outlineOption).toBeDefined();

    outlineOption?.onSelect?.();

    expect(getLastSelectedListType()).toBe("outlineList");
    expect(editor.getHTML()).toContain('data-type="outlineList"');
  });
});
