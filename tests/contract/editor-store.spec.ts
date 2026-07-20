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

  it("register + setFocusedKey publishes the editor; isEditable reflects it", () => {
    const s = useEditorStore();
    const e = stubEditor(true);
    s.register("tab-a", e);
    s.setFocusedKey("tab-a");
    expect(s.editor).toBe(e);
    expect(s.isEditable).toBe(true);
  });

  it("unregister removes the editor (when it is the stored one)", () => {
    const s = useEditorStore();
    const e = stubEditor(false);
    s.register("tab-a", e);
    s.setFocusedKey("tab-a");
    expect(s.isEditable).toBe(false);
    s.unregister("tab-a", e);
    expect(s.editor).toBeUndefined();
    expect(s.isEditable).toBe(false);
  });

  it("unregister is a no-op when a different instance is registered under the key", () => {
    const s = useEditorStore();
    const first = stubEditor(true);
    const second = stubEditor(false);
    s.register("tab-a", first);
    s.register("tab-a", second); // re-register overwrites
    s.setFocusedKey("tab-a");
    expect(s.editor).toBe(second);
    // Unregistering the stale first instance must NOT clear the live second.
    s.unregister("tab-a", first);
    expect(s.editor).toBe(second);
  });

  it("isEditable follows the focused key's editor", () => {
    const s = useEditorStore();
    s.register("tab-a", stubEditor(true));
    s.register("tab-b", stubEditor(false));
    s.setFocusedKey("tab-a");
    expect(s.isEditable).toBe(true);
    s.setFocusedKey("tab-b");
    expect(s.isEditable).toBe(false);
    s.setFocusedKey(null);
    expect(s.editor).toBeUndefined();
    expect(s.isEditable).toBe(false);
  });

  it("editor is undefined when the focused key has no registered editor", () => {
    const s = useEditorStore();
    s.register("tab-a", stubEditor(true));
    s.setFocusedKey("tab-b");
    expect(s.editor).toBeUndefined();
  });
});