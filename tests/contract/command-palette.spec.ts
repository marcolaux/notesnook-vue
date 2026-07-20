import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useCommandPaletteStore } from "@/stores/command-palette";
import { useEditorStore } from "@/stores/editor";
import {
  registerCommands,
  clearCommands,
  type Command,
  type CommandContext
} from "@/commands/registry";
import type { Editor } from "@tiptap/vue-3";

// notes.ts imports `getDatabase` from bootstrap; stub it so the platform
// graph (sodium/crypto/bridge) isn't loaded for a pure store-logic test.
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => ({}),
  bootstrap: vi.fn()
}));

function stubEditor(): Editor {
  return { isEditable: true } as unknown as Editor;
}

function fakeCommands(): Command[] {
  return [
    {
      id: "always",
      title: "Always visible",
      keywords: ["alpha"],
      group: "app",
      run: () => {}
    },
    {
      id: "needs-editor",
      title: "Editor action",
      keywords: ["bold", "strong"],
      group: "editor",
      when: (ctx) => !!ctx.editor,
      run: () => {}
    },
    {
      id: "new-note",
      title: "New note",
      keywords: ["create"],
      group: "app",
      run: () => {}
    }
  ];
}

describe("useCommandPaletteStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    clearCommands();
    registerCommands(fakeCommands());
  });

  it("opens with empty query + activeIndex 0", () => {
    const palette = useCommandPaletteStore();
    expect(palette.open).toBe(false);
    palette.openPalette();
    expect(palette.open).toBe(true);
    expect(palette.query).toBe("");
    expect(palette.activeIndex).toBe(0);
  });

  it("closePalette closes", () => {
    const palette = useCommandPaletteStore();
    palette.openPalette();
    palette.closePalette();
    expect(palette.open).toBe(false);
  });

  it("items exclude commands whose when predicate is false (editor undefined)", () => {
    const palette = useCommandPaletteStore();
    palette.openPalette();
    const ids = palette.items.map((c) => c.id);
    expect(ids).toContain("always");
    expect(ids).toContain("new-note");
    expect(ids).not.toContain("needs-editor");
  });

  it("editor commands become visible once an editor is published", () => {
    const editorStore = useEditorStore();
    editorStore.register("tab", stubEditor());
    editorStore.setFocusedKey("tab");
    const palette = useCommandPaletteStore();
    palette.openPalette();
    expect(palette.items.map((c) => c.id)).toContain("needs-editor");
  });

  it("setQuery filters by subsequence on title + keywords and resets activeIndex", () => {
    const editorStore = useEditorStore();
    editorStore.register("tab", stubEditor()); // make needs-editor visible
    editorStore.setFocusedKey("tab");
    const palette = useCommandPaletteStore();
    palette.openPalette();
    palette.setQuery("bold");
    expect(palette.items.map((c) => c.id)).toEqual(["needs-editor"]);
    expect(palette.activeIndex).toBe(0);
    // title match ("New note") vs keyword — "new" matches the title "New note".
    palette.setQuery("new");
    expect(palette.items.map((c) => c.id)).toEqual(["new-note"]);
  });

  it("next/prev wrap around the filtered list", () => {
    const editorStore = useEditorStore();
    editorStore.register("tab", stubEditor());
    editorStore.setFocusedKey("tab");
    const palette = useCommandPaletteStore();
    palette.openPalette();
    const n = palette.items.length;
    expect(n).toBe(3);
    expect(palette.activeIndex).toBe(0);
    palette.next();
    expect(palette.activeIndex).toBe(1);
    palette.next();
    palette.next();
    expect(palette.activeIndex).toBe(0); // wrapped
    palette.prev();
    expect(palette.activeIndex).toBe(n - 1); // wrapped back
  });

  it("execute runs the active command and closes the palette", () => {
    let ranId: string | null = null;
    clearCommands();
    registerCommands([
      {
        id: "spy",
        title: "Spy",
        group: "app",
        run: () => (ranId = "spy")
      }
    ]);
    const palette = useCommandPaletteStore();
    palette.openPalette();
    palette.execute();
    expect(ranId).toBe("spy");
    expect(palette.open).toBe(false);
  });

  it("execute does not throw when the list is empty", () => {
    clearCommands();
    const palette = useCommandPaletteStore();
    palette.openPalette();
    expect(() => palette.execute()).not.toThrow();
    expect(palette.open).toBe(false);
  });

  it("closePalette is exposed in the command context", () => {
    let closeCalled = false;
    clearCommands();
    registerCommands([
      {
        id: "closer",
        title: "Closer",
        group: "app",
        run: (ctx: CommandContext) => {
          ctx.closePalette();
          closeCalled = true;
        }
      }
    ]);
    const palette = useCommandPaletteStore();
    palette.openPalette();
    palette.execute();
    expect(closeCalled).toBe(true);
    expect(palette.open).toBe(false);
  });
});