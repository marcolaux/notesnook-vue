// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref, reactive } from "vue";

// Controllable fake notes store: `getContent` returns whatever the test stages
// in `contentMap` (a REACTIVE Map so Vue's watcher tracks `Map.get` mutations),
// so the composable's content watcher fires deterministically without touching
// the platform graph.
const contentMap = reactive(new Map<string, { html: string; state: string }>());
let surfaceScrollTo: ReturnType<typeof vi.fn> | undefined;
vi.mock("@/stores/notes", () => ({
  useNotesStore: () => ({
    items: [],
    getContent: (id: string) => contentMap.get(id)
  })
}));
vi.mock("@/stores/editor", () => ({
  useEditorStore: () => ({
    getSurface: () => (surfaceScrollTo ? { scrollToHeading: surfaceScrollTo } : undefined)
  })
}));

import { useNoteToc } from "@/composables/use-note-toc";

describe("useNoteToc", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    contentMap.clear();
    surfaceScrollTo = undefined;
  });

  it("derives the heading outline from the note's loaded content", () => {
    contentMap.set("n1", {
      html: '<h1 id="a">Intro</h1><p>body</p><h2 id="b">Sub</h2>',
      state: "loaded"
    });
    const { items } = useNoteToc(ref("n1"), ref("tab-1"));
    expect(items.value).toEqual([
      { id: "a", level: 1, text: "Intro" },
      { id: "b", level: 2, text: "Sub" }
    ]);
  });

  it("empty outline when the note has no content loaded", () => {
    const { items } = useNoteToc(ref("n1"), ref("tab-1"));
    expect(items.value).toEqual([]);
  });

  it("clears the outline when the note id becomes null", () => {
    contentMap.set("n1", { html: "<h1>Hi</h1>", state: "loaded" });
    const id = ref<string | null>("n1");
    const { items } = useNoteToc(id, ref("tab-1"));
    expect(items.value).toHaveLength(1);
    id.value = null;
    expect(items.value).toEqual([]);
  });

  it("re-derives when the loaded content changes", () => {
    contentMap.set("n1", { html: "<h1>One</h1>", state: "loaded" });
    const { items } = useNoteToc(ref("n1"), ref("tab-1"));
    expect(items.value.map((h) => h.text)).toEqual(["One"]);
    contentMap.set("n1", { html: "<h1>One</h1><h2>Two</h2>", state: "loaded" });
    // The content watcher re-derives (flush:sync).
    expect(items.value.map((h) => h.text)).toEqual(["One", "Two"]);
  });

  it("goto delegates to the pane editor surface (id + text)", () => {
    surfaceScrollTo = vi.fn();
    useNoteToc(ref("n1"), ref("tab-1"));
    const { goto } = useNoteToc(ref("n1"), ref("tab-1"));
    goto("h425", "Introduction");
    expect(surfaceScrollTo).toHaveBeenCalledWith("h425", "Introduction");
  });

  it("goto is a no-op when no tab key / surface is registered", () => {
    const { goto } = useNoteToc(ref("n1")); // no tabKey
    expect(() => goto("h425", "Introduction")).not.toThrow();
  });
});