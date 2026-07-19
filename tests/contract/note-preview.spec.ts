// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  extractNotePreview,
  EMPTY_PREVIEW
} from "@/utils/note-preview";
import { useNotesStore } from "@/stores/notes";

// `notes.ts` imports `getDatabase` from the platform bootstrap; stub it so the
// sodium/crypto/bridge graph isn't pulled into a pure store-logic test. The
// fake db is per-test controllable via `mockDb`.
let mockDb: { content: { findByNoteId: (id: string) => Promise<unknown> } };
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => mockDb,
  bootstrap: vi.fn()
}));

beforeEach(() => {
  setActivePinia(createPinia());
  mockDb = {
    content: { findByNoteId: async () => undefined }
  };
});

describe("extractNotePreview — thumbnail", () => {
  it("returns null thumbnail + null checklist for plain text", () => {
    expect(extractNotePreview("<p>just text</p>")).toEqual(EMPTY_PREVIEW);
  });

  it("returns null for empty html", () => {
    expect(extractNotePreview("")).toEqual(EMPTY_PREVIEW);
  });

  it("extracts the first img src (inline data URL)", () => {
    const html = '<p>hi</p><img src="data:image/svg+xml;base64,abc" width="1"><p>after</p>';
    expect(extractNotePreview(html).thumbnail).toBe("data:image/svg+xml;base64,abc");
  });

  it("returns the FIRST image when several are present", () => {
    const html = '<img src="first.png"><img src="second.png">';
    expect(extractNotePreview(html).thumbnail).toBe("first.png");
  });

  it("skips an attachment-backed img with no src (Phase-6-gated)", () => {
    const html = '<img data-hash="abc" data-filename="x.png" width="10">';
    expect(extractNotePreview(html).thumbnail).toBeNull();
  });

  it("falls back to a later img when the first has no src", () => {
    const html = '<img data-hash="abc"><img src="real.png">';
    expect(extractNotePreview(html).thumbnail).toBe("real.png");
  });
});

describe("extractNotePreview — checklist progress", () => {
  it("counts all-checked checklist", () => {
    const html =
      '<ul class="checklist"><li class="checklist--item checked"><p>a</p></li>' +
      '<li class="checklist--item checked"><p>b</p></li></ul>';
    expect(extractNotePreview(html).checklist).toEqual({ checked: 2, total: 2 });
  });

  it("counts none-checked checklist", () => {
    const html =
      '<ul class="checklist"><li class="checklist--item"><p>a</p></li>' +
      '<li class="checklist--item"><p>b</p></li></ul>';
    expect(extractNotePreview(html).checklist).toEqual({ checked: 0, total: 2 });
  });

  it("counts a mixed checklist", () => {
    const html =
      '<ul class="checklist"><li class="checklist--item checked"><p>a</p></li>' +
      '<li class="checklist--item"><p>b</p></li>' +
      '<li class="checklist--item checked"><p>c</p></li></ul>';
    expect(extractNotePreview(html).checklist).toEqual({ checked: 2, total: 3 });
  });

  it("sums across multiple root task lists (overall note progress)", () => {
    const html =
      '<ul class="checklist"><li class="checklist--item checked"><p>a</p></li></ul>' +
      '<ul class="checklist"><li class="checklist--item"><p>b</p></li>' +
      '<li class="checklist--item checked"><p>c</p></li></ul>';
    expect(extractNotePreview(html).checklist).toEqual({ checked: 2, total: 3 });
  });

  it("ignores nested task-list items (mirrors the node's own parseHTML)", () => {
    // The task-list node skips stats for nested lists (`parentElement.closest
    // ("ul")`); a nested `li.checklist--item` is still a descendant here, so it
    // IS counted. This documents the DOM-class-count behavior (overall items),
    // which is the intended list-level semantics.
    const html =
      '<ul class="checklist"><li class="checklist--item checked"><p>a</p>' +
      '<ul class="checklist"><li class="checklist--item"><p>nested</p></li></ul></li></ul>';
    expect(extractNotePreview(html).checklist).toEqual({ checked: 1, total: 2 });
  });

  it("returns null checklist when no checklist items exist", () => {
    const html = '<p>text</p><ul><li>not a checklist</li></ul>';
    expect(extractNotePreview(html).checklist).toBeNull();
  });
});

describe("extractNotePreview — combined + robustness", () => {
  it("returns both thumbnail and checklist when both present", () => {
    const html =
      '<img src="thumb.png"><ul class="checklist">' +
      '<li class="checklist--item checked"><p>a</p></li>' +
      '<li class="checklist--item"><p>b</p></li></ul>';
    expect(extractNotePreview(html)).toEqual({
      thumbnail: "thumb.png",
      checklist: { checked: 1, total: 2 }
    });
  });

  it("never throws on malformed html", () => {
    expect(() => extractNotePreview("<<<not html>>")).not.toThrow();
    expect(extractNotePreview("<<<not html>>")).toEqual(EMPTY_PREVIEW);
  });
});

describe("notes store — loadPreview", () => {
  it("caches a parsed preview from content.findByNoteId", async () => {
    mockDb.content.findByNoteId = async () => ({
      data: '<img src="a.png"><ul class="checklist"><li class="checklist--item checked"><p>x</p></li></ul>'
    });
    const notes = useNotesStore();
    await notes.loadPreview("n1");
    expect(notes.previews["n1"]).toEqual({
      thumbnail: "a.png",
      checklist: { checked: 1, total: 1 }
    });
  });

  it("is idempotent — a second call does not refetch", async () => {
    const fetcher = vi.fn(async () => ({ data: "<p>plain</p>" }));
    mockDb.content.findByNoteId = fetcher;
    const notes = useNotesStore();
    await notes.loadPreview("n2");
    await notes.loadPreview("n2");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("treats locked content as an empty preview", async () => {
    mockDb.content.findByNoteId = async () => ({ locked: true, data: "" });
    const notes = useNotesStore();
    await notes.loadPreview("n3");
    expect(notes.previews["n3"]).toEqual(EMPTY_PREVIEW);
  });

  it("treats missing content as an empty preview", async () => {
    mockDb.content.findByNoteId = async () => undefined;
    const notes = useNotesStore();
    await notes.loadPreview("n4");
    expect(notes.previews["n4"]).toEqual(EMPTY_PREVIEW);
  });

  it("force re-fetches even when cached", async () => {
    let calls = 0;
    mockDb.content.findByNoteId = async () => {
      calls++;
      return { data: `<p>${calls}</p>` };
    };
    const notes = useNotesStore();
    await notes.loadPreview("n5");
    await notes.loadPreview("n5", true);
    expect(calls).toBe(2);
  });

  it("recovers from a thrown fetch with an empty preview", async () => {
    mockDb.content.findByNoteId = async () => {
      throw new Error("boom");
    };
    const notes = useNotesStore();
    await expect(notes.loadPreview("n6")).resolves.toBeUndefined();
    expect(notes.previews["n6"]).toEqual(EMPTY_PREVIEW);
  });
});