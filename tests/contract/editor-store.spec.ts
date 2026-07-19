import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useEditorStore } from "@/stores/editor";
import type { Editor } from "@tiptap/vue-3";

// Minimal stub that satisfies the `Editor` surface the store reads.
function stubEditor(isEditable = true): Editor {
  return { isEditable } as unknown as Editor;
}

describe("useEditorStore", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("starts with no editor and isEditable false", () => {
    const s = useEditorStore();
    expect(s.editor).toBeUndefined();
    expect(s.isEditable).toBe(false);
  });

  it("set publishes the editor; isEditable reflects it", () => {
    const s = useEditorStore();
    s.set(stubEditor(true));
    expect(s.editor).toBeDefined();
    expect(s.isEditable).toBe(true);
  });

  it("clear removes the editor", () => {
    const s = useEditorStore();
    s.set(stubEditor(false));
    expect(s.isEditable).toBe(false);
    s.clear();
    expect(s.editor).toBeUndefined();
    expect(s.isEditable).toBe(false);
  });

  it("isEditable follows editor.isEditable changes", () => {
    const s = useEditorStore();
    s.set(stubEditor(true));
    expect(s.isEditable).toBe(true);
    s.set(stubEditor(false));
    expect(s.isEditable).toBe(false);
  });
});