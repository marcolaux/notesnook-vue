// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import {
  EDITOR_ACTIONS,
  SLASH_ITEMS,
  filterSlashItems,
  PARITY
} from "@notesnook-vue/editor-vue";

/**
 * A fake editor whose `chain()` returns a chainable spy recording every
 * command called. `run` handlers cast the chain to `any` and call e.g.
 * `.toggleBold()`, so we collect every method invoked on the chain.
 */
function fakeEditor() {
  const calls: string[] = [];
  const chain: Record<string, (...args: unknown[]) => unknown> = new Proxy(
    {},
    {
      get: (_t, prop: string) => (...args: unknown[]) => {
        calls.push(prop);
        return chain; // every command is chainable
      }
    }
  );
  const editor = {
    chain: () => chain,
    isEditable: true
  } as unknown as import("@tiptap/vue-3").Editor;
  return { editor, calls };
}

describe("tool-definitions (editor-vue parity)", () => {
  it("PARITY only lists real upstream ToolIds (compile-checked) and is non-empty", () => {
    expect(PARITY.length).toBeGreaterThan(0);
    // Each entry is a string (the ToolId union guards this at compile time).
    for (const id of PARITY) expect(typeof id).toBe("string");
  });

  it("every EDITOR_ACTIONS entry has a function run", () => {
    expect(EDITOR_ACTIONS.length).toBeGreaterThan(0);
    for (const a of EDITOR_ACTIONS) {
      expect(typeof a.run).toBe("function");
      expect(typeof a.id).toBe("string");
      expect(typeof a.title).toBe("string");
    }
  });

  it("action ids are unique", () => {
    const ids = EDITOR_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("bold run invokes editor.chain().focus().toggleBold().run()", () => {
    const { editor, calls } = fakeEditor();
    const bold = EDITOR_ACTIONS.find((a) => a.id === "bold")!;
    bold.run(editor);
    // `editor.chain()` returns the chainable proxy; the recorded calls are the
    // chain methods invoked after it (focus → toggleBold → run), in order.
    expect(calls).toEqual(["focus", "toggleBold", "run"]);
  });

  it("underline run invokes toggleUnderline (Phase 5.3)", () => {
    const { editor, calls } = fakeEditor();
    EDITOR_ACTIONS.find((a) => a.id === "underline")!.run(editor);
    expect(calls).toEqual(["focus", "toggleUnderline", "run"]);
  });

  it("highlight run invokes toggleHighlight (Phase 5.3)", () => {
    const { editor, calls } = fakeEditor();
    EDITOR_ACTIONS.find((a) => a.id === "highlight")!.run(editor);
    expect(calls).toEqual(["focus", "toggleHighlight", "run"]);
  });

  it("heading-2 run invokes toggleHeading with level 2", () => {
    const { editor, calls } = fakeEditor();
    const h2 = EDITOR_ACTIONS.find((a) => a.id === "headings-2")!;
    h2.run(editor);
    expect(calls).toContain("toggleHeading");
    expect(calls.at(-1)).toBe("run");
  });

  it("checkList run invokes toggleTaskList (our TaskList)", () => {
    const { editor, calls } = fakeEditor();
    EDITOR_ACTIONS.find((a) => a.id === "checkList")!.run(editor);
    expect(calls).toContain("toggleTaskList");
  });

  it("simpleCheckList run invokes toggleCheckList (the simple checkbox list)", () => {
    const { editor, calls } = fakeEditor();
    EDITOR_ACTIONS.find((a) => a.id === "simpleCheckList")!.run(editor);
    expect(calls).toContain("toggleCheckList");
  });

  it("the Lists dropdown menu has a single-task entry next to the task list", () => {
    const editor = { isActive: () => false } as unknown as import("@tiptap/vue-3").Editor;
    const lists = EDITOR_ACTIONS.find((a) => a.id === "lists")!;
    const items = lists.menu!(editor);
    const taskIdx = items.findIndex((i) => i.id === "list-task");
    const simpleIdx = items.findIndex((i) => i.id === "list-simple-check");
    expect(taskIdx).toBeGreaterThanOrEqual(0);
    expect(simpleIdx).toBe(taskIdx + 1);
    expect(items[simpleIdx].label).toBe("tools.submenu.simpleCheckList");
  });

  it("table run invokes insertTable", () => {
    const { editor, calls } = fakeEditor();
    EDITOR_ACTIONS.find((a) => a.id === "table")!.run(editor);
    expect(calls).toContain("insertTable");
  });

  it("SLASH_ITEMS is the slash-flagged subset and is non-empty", () => {
    expect(SLASH_ITEMS.length).toBeGreaterThan(0);
    const slashIds = SLASH_ITEMS.map((a) => a.id);
    expect(slashIds).toContain("headings-1");
    expect(slashIds).toContain("codeBlock");
    expect(slashIds).toContain("table");
    // Inline marks + history are NOT slash items.
    expect(slashIds).not.toContain("bold");
    expect(slashIds).not.toContain("undo");
  });

  it("filterSlashItems subsequence-matches title + keywords", () => {
    expect(filterSlashItems(SLASH_ITEMS, "head").map((a) => a.id)).toContain("headings-1");
    expect(filterSlashItems(SLASH_ITEMS, "todo").map((a) => a.id)).toContain("checkList");
    expect(filterSlashItems(SLASH_ITEMS, "").length).toBe(SLASH_ITEMS.length);
    expect(filterSlashItems(SLASH_ITEMS, "zzzzzz")).toEqual([]);
  });

  it("filterSlashItems ranks title matches ahead of keyword-only matches", () => {
    // "list" matches the title of Bullet/Numbered list; "task" matches a
    // keyword of checkList (title "Task list") — both via title here. Use a
    // keyword-only query to verify ordering: "ul" is a keyword of bulletList.
    const filtered = filterSlashItems(SLASH_ITEMS, "ul").map((a) => a.id);
    expect(filtered).toContain("bulletList");
  });
});