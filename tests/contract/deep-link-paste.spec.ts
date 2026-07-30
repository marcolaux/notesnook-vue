// @vitest-environment happy-dom
/**
 * Deep-link paste bridge (`editor/deep-link-paste.ts`). Exercises the pure
 * `isDeepLinkPasteText` predicate against the REAL `noteIdFromLink` (so the gate
 * stays in lockstep with `internal-link.ts`), and the `handleDeepLinkPaste`
 * glue with a fake `ClipboardEvent` + a stub editor + a mocked `insertNoteLink`
 * (so no TipTap chain is needed). The fake db mocks `getDatabase().notes.note`
 * so the title-resolution path is deterministic. Style mirrors
 * `attachments-bridge.spec.ts`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Keep the real `noteIdFromLink`/`parseInternalLink` (so the predicate is tested
// against the actual parser) but replace `insertNoteLink` with a spy — the
// editor stub never runs a real TipTap chain.
const insertNoteLinkMock = vi.hoisted(() => vi.fn());
vi.mock("@notesnook-vue/editor-vue", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@notesnook-vue/editor-vue")>();
  return { ...actual, insertNoteLink: insertNoteLinkMock };
});

// Fake db: `getDatabase().notes.note(id)` is a spy so tests can both seed the
// title and assert whether it was called (selection-paste must skip it).
const dbRef = vi.hoisted(() => {
  const noteFn = vi.fn();
  return {
    noteFn,
    getDatabase: () => ({ notes: { note: noteFn } })
  };
});
vi.mock("@/platform/bootstrap", () => ({ getDatabase: dbRef.getDatabase }));

const { isDeepLinkPasteText, handleDeepLinkPaste } = await import(
  "@/editor/deep-link-paste"
);

/** Flush the async `insertDeepLink` promise (title fetch + insert). */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Minimal editor stub — only `state.selection.empty` + `isDestroyed` are read. */
function fakeEditor(empty: boolean): unknown {
  return { state: { selection: { empty } }, isDestroyed: false };
}

/** A fake `ClipboardEvent` whose `text/plain` is `plain`, with a `preventDefault` spy. */
function pasteEvent(plain: string): {
  event: ClipboardEvent;
  preventDefault: ReturnType<typeof vi.fn>;
} {
  const preventDefault = vi.fn();
  const clipboardData = {
    getData: (type: string) => (type === "text/plain" ? plain : "")
  };
  const event = { clipboardData, preventDefault } as unknown as ClipboardEvent;
  return { event, preventDefault };
}

beforeEach(() => {
  insertNoteLinkMock.mockReset();
  dbRef.noteFn.mockReset();
});

describe("isDeepLinkPasteText", () => {
  it("accepts a plain note link + a block deep link", () => {
    expect(isDeepLinkPasteText("nn://note/abc")).toBe(true);
    expect(isDeepLinkPasteText("nn://note/abc?blockId=p1")).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(isDeepLinkPasteText("  nn://note/abc  \n")).toBe(true);
  });

  it("rejects empty / non-URL / external-URL text", () => {
    expect(isDeepLinkPasteText("")).toBe(false);
    expect(isDeepLinkPasteText("My Note")).toBe(false);
    expect(isDeepLinkPasteText("https://example.com")).toBe(false);
  });

  it("rejects notebook/monograph deep links (note links only)", () => {
    expect(isDeepLinkPasteText("nn://notebook/nb-7")).toBe(false);
    expect(isDeepLinkPasteText("nn://monograph/m-42")).toBe(false);
  });

  it("rejects a paragraph that merely contains a URL (whole-string gate)", () => {
    expect(isDeepLinkPasteText("see nn://note/abc")).toBe(false);
    expect(isDeepLinkPasteText("nn://note/abc is the link")).toBe(false);
  });
});

describe("handleDeepLinkPaste — gating", () => {
  it("handles a deep link: returns true, preventDefault, inserts titled link", async () => {
    dbRef.noteFn.mockResolvedValue({ title: "Project Plan" });
    const { event, preventDefault } = pasteEvent("nn://note/abc?blockId=p1");
    const editor = fakeEditor(true); // empty selection → title is used

    const handled = handleDeepLinkPaste(editor as never, event);
    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    await flush();

    expect(dbRef.noteFn).toHaveBeenCalledWith("abc");
    expect(insertNoteLinkMock).toHaveBeenCalledTimes(1);
    expect(insertNoteLinkMock).toHaveBeenCalledWith(editor, {
      href: "nn://note/abc?blockId=p1",
      title: "Project Plan"
    });
  });

  it("returns false for non-link text without preventing default or inserting", async () => {
    const { event, preventDefault } = pasteEvent("just some text");
    const handled = handleDeepLinkPaste(fakeEditor(true) as never, event);
    expect(handled).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    await flush();
    expect(dbRef.noteFn).not.toHaveBeenCalled();
    expect(insertNoteLinkMock).not.toHaveBeenCalled();
  });

  it("does not throw when clipboardData is missing", () => {
    const event = { clipboardData: null } as unknown as ClipboardEvent;
    expect(handleDeepLinkPaste(fakeEditor(true) as never, event)).toBe(false);
  });
});

describe("handleDeepLinkPaste — selection-awareness", () => {
  it("with a selection: skips the title lookup and links the selected text", async () => {
    const { event } = pasteEvent("nn://note/abc");
    const editor = fakeEditor(false); // non-empty selection

    const handled = handleDeepLinkPaste(editor as never, event);
    expect(handled).toBe(true);
    await flush();

    // No db lookup — the selected text is kept (insertNoteLink handles that).
    expect(dbRef.noteFn).not.toHaveBeenCalled();
    expect(insertNoteLinkMock).toHaveBeenCalledWith(editor, {
      href: "nn://note/abc",
      title: ""
    });
  });

  it("with no selection + missing note: falls back to 'Untitled'", async () => {
    dbRef.noteFn.mockResolvedValue(undefined); // missing/trashed/locked
    const { event } = pasteEvent("nn://note/abc");
    const editor = fakeEditor(true);

    handleDeepLinkPaste(editor as never, event);
    await flush();

    expect(insertNoteLinkMock).toHaveBeenCalledWith(editor, {
      href: "nn://note/abc",
      title: "Untitled"
    });
  });
});