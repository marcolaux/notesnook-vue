// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  buildEditorMenu,
  type EditorMenuTarget,
  type EditorMenuDeps
} from "@/utils/editor-context-menu";
import type { MenuItem } from "@/utils/context-menu";

/** A target snapshot with nothing active (the common baseline). */
function target(over: Partial<EditorMenuTarget> = {}): EditorMenuTarget {
  return {
    hasSelection: false,
    editable: true,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    code: false,
    highlight: false,
    link: null,
    media: null,
    ...over
  };
}

/** Deps fixture with spy callbacks (every callback is a `vi.fn`). */
function deps(): EditorMenuDeps {
  return {
    cut: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    pasteAsPlainText: vi.fn(),
    toggleBold: vi.fn(),
    toggleItalic: vi.fn(),
    toggleUnderline: vi.fn(),
    toggleStrike: vi.fn(),
    toggleCode: vi.fn(),
    toggleHighlight: vi.fn(),
    clearFormatting: vi.fn(),
    openLinkDialog: vi.fn(),
    editLink: vi.fn(),
    removeLink: vi.fn(),
    linkToNote: vi.fn(),
    insertTodayDateLink: vi.fn(),
    insertDate: vi.fn(),
    insertImage: vi.fn(),
    insertTable: vi.fn(),
    insertHorizontalRule: vi.fn(),
    insertCodeBlock: vi.fn(),
    insertBlockquote: vi.fn(),
    toggleBulletList: vi.fn(),
    toggleNumberedList: vi.fn(),
    toggleCheckList: vi.fn(),
    toggleSimpleCheckList: vi.fn(),
    toggleOutlineList: vi.fn(),
    copyBlockLink: vi.fn(),
    findInNote: vi.fn(),
    replaceInNote: vi.fn(),
    openCommandPalette: vi.fn(),
    openMediaInNewTab: vi.fn(),
    openMediaInNewWindow: vi.fn()
  };
}

/** Find a non-separator entry by id (throws if missing so tests fail loudly). */
function item(entries: MenuItem[], id: string): MenuItem {
  const e = entries.find((x) => x.id === id);
  if (!e) throw new Error(`entry ${id} not found`);
  return e;
}

describe("buildEditorMenu — clipboard + disabled state", () => {
  it("disables Cut/Copy/Clear-formatting/Link when there is no selection", () => {
    const entries = buildEditorMenu(target({ hasSelection: false }), deps());
    expect(item(entries, "cut").disabled).toBe(true);
    expect(item(entries, "copy").disabled).toBe(true);
    expect(item(entries, "clear-formatting").disabled).toBe(true);
    expect(item(entries, "link").disabled).toBe(true);
    // Paste only needs editability.
    expect(item(entries, "paste").disabled).toBe(false);
    expect(item(entries, "paste-plain").disabled).toBe(false);
  });

  it("enables Cut/Copy/Clear-formatting/Link when there is a selection", () => {
    const entries = buildEditorMenu(target({ hasSelection: true }), deps());
    expect(item(entries, "cut").disabled).toBe(false);
    expect(item(entries, "copy").disabled).toBe(false);
    expect(item(entries, "clear-formatting").disabled).toBe(false);
    expect(item(entries, "link").disabled).toBe(false);
  });

  it("disables Cut + Paste when the editor is not editable", () => {
    const entries = buildEditorMenu(
      target({ hasSelection: true, editable: false }),
      deps()
    );
    expect(item(entries, "cut").disabled).toBe(true);
    expect(item(entries, "paste").disabled).toBe(true);
    expect(item(entries, "paste-plain").disabled).toBe(true);
    // Copy still works on a read-only selection.
    expect(item(entries, "copy").disabled).toBe(false);
  });
});

describe("buildEditorMenu — formatting checked state", () => {
  it("marks active formats as checked", () => {
    const entries = buildEditorMenu(
      target({ hasSelection: true, bold: true, italic: true, highlight: true }),
      deps()
    );
    expect(item(entries, "bold").checked).toBe(true);
    expect(item(entries, "italic").checked).toBe(true);
    expect(item(entries, "highlight").checked).toBe(true);
    expect(item(entries, "underline").checked).toBe(false);
    expect(item(entries, "strikethrough").checked).toBe(false);
    expect(item(entries, "code").checked).toBe(false);
  });

  it("leaves all formats unchecked when none are active", () => {
    const entries = buildEditorMenu(target({ hasSelection: true }), deps());
    for (const id of ["bold", "italic", "underline", "strikethrough", "code", "highlight"]) {
      expect(item(entries, id).checked).toBe(false);
    }
  });
});

describe("buildEditorMenu — link row", () => {
  it("shows Edit link + Remove link (no plain Link…) when a link is active", () => {
    const entries = buildEditorMenu(
      target({ hasSelection: true, link: { href: "https://example.com" } }),
      deps()
    );
    expect(item(entries, "edit-link").label).toBeTruthy();
    expect(item(entries, "remove-link").label).toBeTruthy();
    expect(entries.find((x) => x.id === "link")).toBeUndefined();
  });

  it("shows plain Link… when no link is active", () => {
    const entries = buildEditorMenu(target({ hasSelection: true }), deps());
    expect(item(entries, "link").label).toBeTruthy();
    expect(entries.find((x) => x.id === "edit-link")).toBeUndefined();
    expect(entries.find((x) => x.id === "remove-link")).toBeUndefined();
  });
});

describe("buildEditorMenu — submenus + actions present", () => {
  it("includes Insert + List submenus and the action entries", () => {
    const entries = buildEditorMenu(target(), deps());
    const insert = item(entries, "insert");
    const list = item(entries, "list");
    expect(insert.submenu).toBeDefined();
    expect(list.submenu).toBeDefined();
    expect(item(entries, "find-in-note").label).toBeTruthy();
    expect(item(entries, "replace-in-note").label).toBeTruthy();
    expect(item(entries, "command-palette").label).toBeTruthy();
    expect(item(entries, "copy-block-link").label).toBeTruthy();
  });

  it("builds the Insert submenu leaves", () => {
    const entries = buildEditorMenu(target(), deps());
    const leaves = item(entries, "insert").submenu!.build("");
    const ids = leaves.filter((l) => !l.separator).map((l) => l.id);
    expect(ids).toEqual([
      "ins-link-note",
      "ins-today",
      "ins-date",
      "ins-image",
      "ins-table",
      "ins-hr",
      "ins-code",
      "ins-quote"
    ]);
  });

  it("builds the List submenu leaves", () => {
    const entries = buildEditorMenu(target(), deps());
    const leaves = item(entries, "list").submenu!.build("");
    const ids = leaves.filter((l) => !l.separator).map((l) => l.id);
    expect(ids).toEqual([
      "list-bullet",
      "list-numbered",
      "list-check",
      "list-simple-check",
      "list-outline"
    ]);
  });
});

describe("buildEditorMenu — media (image / attachment chip)", () => {
  const media = { hash: "h", filename: "f.png", mime: "image/png", size: 1234 };

  it("prepends Open in new tab + Open in new window when a media node is targeted", () => {
    const entries = buildEditorMenu(target({ hasSelection: true, media }), deps());
    expect(item(entries, "media-open-tab").label).toBeTruthy();
    expect(item(entries, "media-open-window").label).toBeTruthy();
    // The media rows lead the menu (before clipboard).
    expect(entries.findIndex((x) => x.id === "media-open-tab")).toBeLessThan(
      entries.findIndex((x) => x.id === "cut")
    );
  });

  it("omits the media rows when no media node is targeted", () => {
    const entries = buildEditorMenu(target({ hasSelection: true }), deps());
    expect(entries.find((x) => x.id === "media-open-tab")).toBeUndefined();
    expect(entries.find((x) => x.id === "media-open-window")).toBeUndefined();
  });

  it("fires openMediaInNewTab + openMediaInNewWindow for the media rows", async () => {
    const d = deps();
    const entries = buildEditorMenu(target({ media }), d);
    const run = async (id: string) => {
      const e = item(entries, id);
      if (e.onSelect) await e.onSelect();
    };
    await run("media-open-tab");
    await run("media-open-window");
    expect(d.openMediaInNewTab).toHaveBeenCalledTimes(1);
    expect(d.openMediaInNewWindow).toHaveBeenCalledTimes(1);
  });
});

describe("buildEditorMenu — onSelect wiring", () => {
  it("fires the matching dep callback for representative entries", async () => {
    const d = deps();
    const entries = buildEditorMenu(target({ hasSelection: true }), d);
    const run = async (id: string) => {
      const e = item(entries, id);
      if (e.onSelect) await e.onSelect();
    };
    await run("copy");
    await run("bold");
    await run("link");
    await run("copy-block-link");
    await run("find-in-note");
    await run("replace-in-note");
    await run("command-palette");
    expect(d.copy).toHaveBeenCalledTimes(1);
    expect(d.toggleBold).toHaveBeenCalledTimes(1);
    expect(d.openLinkDialog).toHaveBeenCalledTimes(1);
    expect(d.copyBlockLink).toHaveBeenCalledTimes(1);
    expect(d.findInNote).toHaveBeenCalledTimes(1);
    expect(d.replaceInNote).toHaveBeenCalledTimes(1);
    expect(d.openCommandPalette).toHaveBeenCalledTimes(1);
  });

  it("fires pasteAsPlainText for the paste-plain entry", async () => {
    const d = deps();
    const entries = buildEditorMenu(target({ hasSelection: true }), d);
    const e = item(entries, "paste-plain");
    if (e.onSelect) await e.onSelect();
    expect(d.pasteAsPlainText).toHaveBeenCalledTimes(1);
  });

  it("fires edit-link + remove-link callbacks when a link is active", async () => {
    const d = deps();
    const entries = buildEditorMenu(
      target({ hasSelection: true, link: { href: "https://x.io" } }),
      d
    );
    const run = async (id: string) => {
      const e = item(entries, id);
      if (e.onSelect) await e.onSelect();
    };
    await run("edit-link");
    await run("remove-link");
    expect(d.editLink).toHaveBeenCalledTimes(1);
    expect(d.removeLink).toHaveBeenCalledTimes(1);
  });

  it("fires submenu leaf callbacks (link-to-note, insert-table, toggle-bullet)", async () => {
    const d = deps();
    const entries = buildEditorMenu(target(), d);
    const insertLeaves = item(entries, "insert").submenu!.build("");
    const listLeaves = item(entries, "list").submenu!.build("");
    const run = async (arr: MenuItem[], id: string) => {
      const e = arr.find((x) => x.id === id);
      if (e?.onSelect) await e.onSelect();
    };
    await run(insertLeaves, "ins-link-note");
    await run(insertLeaves, "ins-table");
    await run(listLeaves, "list-bullet");
    expect(d.linkToNote).toHaveBeenCalledTimes(1);
    expect(d.insertTable).toHaveBeenCalledTimes(1);
    expect(d.toggleBulletList).toHaveBeenCalledTimes(1);
  });
});