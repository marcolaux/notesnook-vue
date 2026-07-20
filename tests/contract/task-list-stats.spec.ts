// @vitest-environment happy-dom
/**
 * Behavioural test for the task-list-state-management plugin: toggling a task
 * item's `checked` attribute must update the root task list's `stats`
 * attribute (which drives the in-editor progress bar + N/M count). The notes
 * list re-parses HTML so it sees progress regardless; the in-editor header
 * depends on `stats`, so this is the contract that breaks the header.
 */
import { describe, it, expect, afterAll } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskListNode, TaskItemNode } from "@notesnook-vue/editor-vue";

const editor = new Editor({
  element: document.createElement("div"),
  extensions: [StarterKit.configure({ codeBlock: false }), TaskListNode, TaskItemNode.configure({ nested: true })],
  content: ""
});
afterAll(() => editor.destroy());

function rootStats(): { checked: number; total: number } | null {
  let stats: { checked: number; total: number } | null = null;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "taskList" && stats === null) {
      stats = node.attrs.stats as { checked: number; total: number };
    }
  });
  return stats;
}

describe("task-list stats plugin", () => {
  it("updates root stats when a task item is checked", () => {
    editor.commands.setContent(
      '<ul class="checklist"><li class="checklist--item"><p>a</p></li><li class="checklist--item"><p>b</p></li></ul>'
    );
    expect(rootStats()).toEqual({ checked: 0, total: 2 });

    // Toggle the first task item to checked via setNodeMarkup (mirrors what
    // the checkbox's updateAttributes({ checked }) does).
    let itemPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (itemPos === -1 && node.type.name === "taskItem") itemPos = pos;
    });
    expect(itemPos).toBeGreaterThan(-1);

    const item = editor.state.doc.nodeAt(itemPos)!;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(itemPos, undefined, { ...item.attrs, checked: true })
    );

    expect(rootStats()).toEqual({ checked: 1, total: 2 });
  });

  it("updates root stats when a task item is unchecked", () => {
    editor.commands.setContent(
      '<ul class="checklist"><li class="checklist--item checked"><p>a</p></li><li class="checklist--item checked"><p>b</p></li></ul>'
    );
    expect(rootStats()).toEqual({ checked: 2, total: 2 });

    let itemPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (itemPos === -1 && node.type.name === "taskItem") itemPos = pos;
    });
    const item = editor.state.doc.nodeAt(itemPos)!;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(itemPos, undefined, { ...item.attrs, checked: false })
    );

    expect(rootStats()).toEqual({ checked: 1, total: 2 });
  });
});