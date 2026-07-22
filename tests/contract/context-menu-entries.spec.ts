// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  buildNoteMenu,
  buildNotebookMenu,
  buildTagMenu,
  buildShortcutMenu,
  buildColorRowMenu,
  buildColorSubmenu,
  buildTagsSubmenu,
  buildNotebooksSubmenu,
  buildSidebarSectionMenu,
  buildMultiNoteMenu,
  buildMultiTagsSubmenu,
  buildMultiNotebooksSubmenu,
  buildMultiColorSubmenu,
  type NoteMenuTarget,
  type MultiMenuSelection,
  type MultiNoteMenuDeps,
  type ConfirmFn
} from "@/utils/context-menu-entries";

/** Run a builder entry's `onSelect` by id (awaiting async ones) + return whether
 *  it existed. Throws if the id is missing so the test fails loudly. */
async function runById(entries: { id: string; onSelect?: () => unknown }[], id: string): Promise<void> {
  const e = entries.find((x) => x.id === id);
  if (!e) throw new Error(`entry ${id} not found`);
  if (e.onSelect) await e.onSelect();
}

/** Labels in display order (separators rendered as `─`). */
function labels(entries: { label: string; separator?: boolean }[]): string[] {
  return entries.map((e) => (e.separator ? "─" : e.label));
}

/** Build a confirm spy that resolves `ok`. Per-test so call counts don't leak. */
function confirmSpy(ok: boolean): ConfirmFn & ReturnType<typeof vi.fn> {
  return vi.fn(() => Promise.resolve(ok)) as unknown as ConfirmFn & ReturnType<typeof vi.fn>;
}

/** A note target with empty assignments (the common submenu baseline). */
function noteTarget(over: Partial<NoteMenuTarget> = {}): NoteMenuTarget {
  return { id: "n1", title: "Note 1", pinned: false, favorite: false, published: false, colorId: null, tagIds: [], notebookIds: [], ...over };
}

/** Full NoteMenuDeps fixture with spy callbacks + sample colors/tags/notebooks. */
function baseNoteDeps() {
  return {
    openInWindow: vi.fn(),
    openInSplit: vi.fn(),
    togglePinned: vi.fn(),
    toggleFavorite: vi.fn(),
    colors: [
      { id: "red", title: "Red", colorCode: "#f00" },
      { id: "blue", title: "Blue", colorCode: "#00f" }
    ],
    setColor: vi.fn(),
    clearColor: vi.fn(),
    presetColors: [
      { id: "green", title: "Green", colorCode: "#008000" },
      { id: "blue-preset", title: "Blue", colorCode: "#00f" }
    ],
    assignPresetColor: vi.fn(),
    createColor: vi.fn(),
    tags: [
      { id: "t1", title: "work" },
      { id: "t2", title: "personal" }
    ],
    addTag: vi.fn(),
    removeTag: vi.fn(),
    createTag: vi.fn(),
    notebooks: [
      { id: "b1", title: "Projects" },
      { id: "b2", title: "Inbox" }
    ],
    addNotebook: vi.fn(),
    removeNotebook: vi.fn(),
    createNotebook: vi.fn(),
    confirm: vi.fn(() => Promise.resolve(true)) as unknown as ConfirmFn & ReturnType<typeof vi.fn>,
    deleteNote: vi.fn(),
    archiveNote: vi.fn(),
    remindMe: vi.fn(),
    publishNote: vi.fn(),
    unpublishNote: vi.fn(),
    copyMonographUrl: vi.fn(),
    openMonograph: vi.fn()
  };
}
type NoteDeps = ReturnType<typeof baseNoteDeps>;
function noteDeps(over: Partial<NoteDeps> = {}): NoteDeps {
  return { ...baseNoteDeps(), ...over };
}

describe("buildNoteMenu", () => {
  it("emits open/split/toggles + a separator + Color/Tags/Notebooks submenu parents", () => {
    const entries = buildNoteMenu(noteTarget(), noteDeps());
    expect(labels(entries)).toEqual([
      "Open in new window",
      "Open in split right",
      "Open in split down",
      "─",
      "Pin to top",
      "Favorite",
      "Remind me…",
      "─",
      "Publish note",
      "─",
      "Color",
      "Tags",
      "Notebooks",
      "─",
      "Archive",
      "Move to trash"
    ]);
  });

  it("the Color/Tags/Notebooks entries carry a submenu spec", () => {
    const entries = buildNoteMenu(noteTarget(), noteDeps());
    expect(entries.find((e) => e.id === "color")!.submenu).toBeDefined();
    expect(entries.find((e) => e.id === "tags")!.submenu).toBeDefined();
    expect(entries.find((e) => e.id === "notebooks")!.submenu).toBeDefined();
  });

  it("toggle entries carry the current checked state", () => {
    const entries = buildNoteMenu(noteTarget({ pinned: true, favorite: true }), noteDeps());
    expect(entries.find((e) => e.id === "toggle-pinned")!.checked).toBe(true);
    expect(entries.find((e) => e.id === "toggle-favorite")!.checked).toBe(true);
  });

  it("onSelect calls the right dep with the note id", async () => {
    const deps = noteDeps();
    const entries = buildNoteMenu(noteTarget(), deps);
    await runById(entries, "open-window");
    expect(deps.openInWindow).toHaveBeenCalledWith("n1");
    await runById(entries, "split-down");
    expect(deps.openInSplit).toHaveBeenCalledWith("n1", "bottom");
    await runById(entries, "toggle-pinned");
    expect(deps.togglePinned).toHaveBeenCalledWith("n1");
  });

  it("the Move to trash entry is flagged danger", () => {
    const entries = buildNoteMenu(noteTarget(), noteDeps());
    expect(entries.find((e) => e.id === "delete")!.danger).toBe(true);
  });

  it("delete confirms first; on cancel it does NOT delete", async () => {
    const deps = noteDeps({ confirm: confirmSpy(false) });
    const entries = buildNoteMenu(noteTarget(), deps);
    await runById(entries, "delete");
    expect(deps.confirm).toHaveBeenCalledOnce();
    expect(deps.deleteNote).not.toHaveBeenCalled();
  });

  it("delete on confirm calls deleteNote with the note id", async () => {
    const deps = noteDeps({ confirm: confirmSpy(true) });
    const entries = buildNoteMenu(noteTarget(), deps);
    await runById(entries, "delete");
    expect(deps.deleteNote).toHaveBeenCalledWith("n1");
  });

  it("when not published shows a Publish note entry that calls publishNote(id, title)", async () => {
    const deps = noteDeps();
    const entries = buildNoteMenu(noteTarget({ published: false }), deps);
    expect(labels(entries)).toContain("Publish note");
    expect(entries.find((e) => e.id === "unpublish")).toBeUndefined();
    await runById(entries, "publish");
    expect(deps.publishNote).toHaveBeenCalledWith("n1", "Note 1");
  });

  it("when published shows Unpublish / Copy URL / Open in browser (no Publish note)", async () => {
    const deps = noteDeps();
    const entries = buildNoteMenu(noteTarget({ published: true }), deps);
    expect(labels(entries)).not.toContain("Publish note");
    expect(labels(entries)).toEqual(expect.arrayContaining(["Unpublish note", "Copy monograph URL", "Open in browser"]));
    await runById(entries, "copy-url");
    expect(deps.copyMonographUrl).toHaveBeenCalledWith("n1");
    await runById(entries, "open-monograph");
    expect(deps.openMonograph).toHaveBeenCalledWith("n1");
  });

  it("unpublish is confirm-gated; on cancel it does NOT unpublish", async () => {
    const deps = noteDeps({ confirm: confirmSpy(false) });
    const entries = buildNoteMenu(noteTarget({ published: true }), deps);
    await runById(entries, "unpublish");
    expect(deps.confirm).toHaveBeenCalledOnce();
    expect(deps.unpublishNote).not.toHaveBeenCalled();
  });

  it("unpublish on confirm calls unpublishNote with the note id", async () => {
    const deps = noteDeps({ confirm: confirmSpy(true) });
    const entries = buildNoteMenu(noteTarget({ published: true }), deps);
    await runById(entries, "unpublish");
    expect(deps.unpublishNote).toHaveBeenCalledWith("n1");
  });
});

describe("buildColorSubmenu", () => {
  it("lists No color + existing colors + presets (filtered) + New color…", () => {
    const spec = buildColorSubmenu(noteTarget({ colorId: null }), noteDeps());
    const items = spec.build("");
    // existing colors: Red, Blue; presets: Green (Blue preset filtered — same #00f
    // as the existing Blue), so only Green remains; then New color…
    expect(labels(items)).toEqual([
      "No color",
      "─",
      "Red",
      "Blue",
      "─",
      "Green",
      "─",
      "New color…"
    ]);
    expect(items[0]!.checked).toBe(true); // no color assigned
    expect(items[2]!.color).toBe("#f00");
    expect(items[2]!.checked).toBe(false);
  });

  it("filters out presets whose colorCode already matches an existing color", () => {
    const spec = buildColorSubmenu(noteTarget(), noteDeps());
    const items = spec.build("");
    // The Blue preset (#00f) is filtered because "Blue" already exists.
    expect(items.find((i) => i.label === "Green")).toBeDefined();
    expect(items.find((i) => i.color === "#00f" && i.id.startsWith("preset-"))).toBeUndefined();
  });

  it("checks the assigned color + No color is unchecked", () => {
    const spec = buildColorSubmenu(noteTarget({ colorId: "blue" }), noteDeps());
    const items = spec.build("");
    expect(items[0]!.checked).toBe(false); // No color
    expect(items.find((i) => i.id === "blue")!.checked).toBe(true);
  });

  it("No color runs clearColor; an existing color runs setColor with the note id", async () => {
    const deps = noteDeps();
    const spec = buildColorSubmenu(noteTarget(), deps);
    const items = spec.build("");
    await runById(items, "no-color");
    expect(deps.clearColor).toHaveBeenCalledWith("n1");
    await runById(items, "red");
    expect(deps.setColor).toHaveBeenCalledWith("red", "n1");
  });

  it("a preset swatch runs assignPresetColor with title + colorCode + note id", async () => {
    const deps = noteDeps();
    const spec = buildColorSubmenu(noteTarget(), deps);
    const items = spec.build("");
    const green = items.find((i) => i.label === "Green")!;
    await runById([green], green.id);
    expect(deps.assignPresetColor).toHaveBeenCalledWith("Green", "#008000", "n1");
  });

  it("New color… runs createColor with the note id", async () => {
    const deps = noteDeps();
    const spec = buildColorSubmenu(noteTarget(), deps);
    const items = spec.build("");
    await runById(items, "new-color");
    expect(deps.createColor).toHaveBeenCalledWith("n1");
  });

  it("shows only No color + New color… when there are no colors/presets", () => {
    const deps = noteDeps({ colors: [], presetColors: [] });
    const spec = buildColorSubmenu(noteTarget(), deps);
    expect(labels(spec.build(""))).toEqual(["No color", "─", "New color…"]);
  });
});

describe("buildTagsSubmenu", () => {
  it("has a search field + lists all tags with keepOpen toggles", () => {
    const spec = buildTagsSubmenu(noteTarget(), noteDeps());
    expect(spec.search).toEqual({ placeholder: "Search tags…" });
    const items = spec.build("");
    expect(labels(items)).toEqual(["work", "personal"]);
    expect(items.every((i) => i.keepOpen)).toBe(true);
  });

  it("marks assigned tags checked", () => {
    const spec = buildTagsSubmenu(noteTarget({ tagIds: ["t1"] }), noteDeps());
    const items = spec.build("");
    expect(items.find((i) => i.id === "t1")!.checked).toBe(true);
    expect(items.find((i) => i.id === "t2")!.checked).toBe(false);
  });

  it("toggling an assigned tag calls removeTag; an unassigned one calls addTag", async () => {
    const deps = noteDeps();
    const spec = buildTagsSubmenu(noteTarget({ tagIds: ["t1"] }), deps);
    const items = spec.build("");
    await runById(items, "t1"); // assigned → remove
    expect(deps.removeTag).toHaveBeenCalledWith("t1", "n1");
    expect(deps.addTag).not.toHaveBeenCalled();
    await runById(items, "t2"); // unassigned → add
    expect(deps.addTag).toHaveBeenCalledWith("t2", "n1");
  });

  it("filters by case-insensitive query", () => {
    const spec = buildTagsSubmenu(noteTarget(), noteDeps());
    // Only the real tag rows (drop the separator + Create entry) should match.
    const tagLabels = (q: string) =>
      spec.build(q).filter((i) => !i.separator && i.id !== "create-tag").map((i) => i.label);
    expect(tagLabels("per")).toEqual(["personal"]);
    expect(tagLabels("WOR")).toEqual(["work"]);
  });

  it("emits a Create entry only for a non-empty, non-matching query", () => {
    const spec = buildTagsSubmenu(noteTarget(), noteDeps());
    expect(spec.build("").find((i) => i.id === "create-tag")).toBeUndefined();
    expect(spec.build("work").find((i) => i.id === "create-tag")).toBeUndefined(); // exact match
    const created = spec.build("newtag").find((i) => i.id === "create-tag");
    expect(created).toBeDefined();
    expect(created!.label).toBe("Create “newtag”");
  });

  it("the Create entry calls createTag with the query + note id", async () => {
    const deps = noteDeps();
    const spec = buildTagsSubmenu(noteTarget(), deps);
    const items = spec.build("urgent");
    await runById(items, "create-tag");
    expect(deps.createTag).toHaveBeenCalledWith("urgent", "n1");
  });
});

describe("buildNotebooksSubmenu", () => {
  it("has a search field + lists notebooks + a Create entry for a non-matching query", () => {
    const spec = buildNotebooksSubmenu(noteTarget(), noteDeps());
    expect(spec.search).toEqual({ placeholder: "Search notebooks…" });
    expect(spec.build("").map((i) => i.label)).toEqual(["Projects", "Inbox"]);
    // A non-matching query yields a separator + the Create entry.
    expect(labels(spec.build("New"))).toEqual(["─", "Create “New”"]);
  });

  it("toggling membership calls addNotebook / removeNotebook with the note id", async () => {
    const deps = noteDeps();
    const spec = buildNotebooksSubmenu(noteTarget({ notebookIds: ["b1"] }), deps);
    const items = spec.build("");
    await runById(items, "b1"); // member → remove
    expect(deps.removeNotebook).toHaveBeenCalledWith("b1", "n1");
    await runById(items, "b2"); // not a member → add
    expect(deps.addNotebook).toHaveBeenCalledWith("b2", "n1");
  });

  it("the Create entry calls createNotebook with the query + note id", async () => {
    const deps = noteDeps();
    const spec = buildNotebooksSubmenu(noteTarget(), deps);
    await runById(spec.build("Trips"), "create-notebook");
    expect(deps.createNotebook).toHaveBeenCalledWith("Trips", "n1");
  });
});

describe("buildNotebookMenu", () => {
  const baseDeps = (confirm: ConfirmFn) => ({
    createSubNotebook: vi.fn(),
    toggleShortcut: vi.fn(),
    isShortcut: vi.fn(() => false),
    togglePinnedToTop: vi.fn(),
    rename: vi.fn(),
    setIcon: vi.fn(),
    removeIcon: vi.fn(),
    confirm,
    deleteNotebook: vi.fn()
  });

  it("emits new-sub / sep / shortcut / pinned-top / sep / rename / set-icon / remove-icon / delete", () => {
    const entries = buildNotebookMenu({ id: "b1", title: "Work", pinned: false }, baseDeps(confirmSpy(true)));
    expect(labels(entries)).toEqual([
      "New sub-notebook",
      "─",
      "Pin to sidebar",
      "Pinned to top",
      "─",
      "Rename…",
      "Set icon…",
      "Remove icon",
      "Delete notebook"
    ]);
    expect(entries.find((e) => e.id === "delete")!.danger).toBe(true);
  });

  it("remove-icon is disabled when the notebook has no icon", () => {
    const entries = buildNotebookMenu(
      { id: "b1", title: "Work", pinned: false, icon: null },
      baseDeps(confirmSpy(true))
    );
    expect(entries.find((e) => e.id === "remove-icon")!.disabled).toBe(true);
  });

  it("remove-icon is enabled + set-icon wires to deps when an icon is set", async () => {
    const deps = baseDeps(confirmSpy(true));
    const entries = buildNotebookMenu(
      { id: "b1", title: "Work", pinned: false, icon: "star" },
      deps
    );
    expect(entries.find((e) => e.id === "remove-icon")!.disabled).toBe(false);
    await runById(entries, "set-icon");
    expect(deps.setIcon).toHaveBeenCalledWith("b1");
    await runById(entries, "remove-icon");
    expect(deps.removeIcon).toHaveBeenCalledWith("b1");
  });

  it("shortcut label flips to Unpin + checked when already a shortcut", () => {
    const deps = baseDeps(confirmSpy(true));
    deps.isShortcut = vi.fn(() => true);
    const entries = buildNotebookMenu({ id: "b1", title: "Work", pinned: false }, deps);
    const sc = entries.find((e) => e.id === "toggle-shortcut")!;
    expect(sc.label).toBe("Unpin from sidebar");
    expect(sc.checked).toBe(true);
  });

  it("pinned-top label flips to Unpin from top + checked when notebook.pinned", () => {
    const entries = buildNotebookMenu({ id: "b1", title: "Work", pinned: true }, baseDeps(confirmSpy(true)));
    const p = entries.find((e) => e.id === "toggle-pinned-top")!;
    expect(p.label).toBe("Unpin from top");
    expect(p.checked).toBe(true);
  });

  it("rename onSelect calls deps.rename with id + current title", async () => {
    const deps = baseDeps(confirmSpy(true));
    const entries = buildNotebookMenu({ id: "b1", title: "Work", pinned: false }, deps);
    await runById(entries, "rename");
    expect(deps.rename).toHaveBeenCalledWith("b1", "Work");
  });

  it("delete confirms first; on cancel it does NOT delete", async () => {
    const deps = baseDeps(confirmSpy(false));
    const entries = buildNotebookMenu({ id: "b1", title: "Work", pinned: false }, deps);
    await runById(entries, "delete");
    expect(deps.confirm).toHaveBeenCalledOnce();
    expect(deps.deleteNotebook).not.toHaveBeenCalled();
  });

  it("delete on confirm calls deleteNotebook with the id", async () => {
    const deps = baseDeps(confirmSpy(true));
    const entries = buildNotebookMenu({ id: "b1", title: "Work", pinned: false }, deps);
    await runById(entries, "delete");
    expect(deps.deleteNotebook).toHaveBeenCalledWith("b1");
  });

  it("create-sub + toggle-shortcut + toggle-pinned-to-top wire to their deps", async () => {
    const deps = baseDeps(confirmSpy(true));
    const entries = buildNotebookMenu({ id: "b1", title: "Work", pinned: false }, deps);
    await runById(entries, "new-sub");
    expect(deps.createSubNotebook).toHaveBeenCalledWith("b1");
    await runById(entries, "toggle-shortcut");
    expect(deps.toggleShortcut).toHaveBeenCalledWith("b1");
    await runById(entries, "toggle-pinned-top");
    expect(deps.togglePinnedToTop).toHaveBeenCalledWith("b1");
  });
});

describe("buildTagMenu", () => {
  const baseDeps = (confirm: ConfirmFn) => ({
    toggleShortcut: vi.fn(),
    isShortcut: vi.fn(() => false),
    rename: vi.fn(),
    confirm,
    deleteTag: vi.fn()
  });

  it("emits shortcut / sep / rename / delete", () => {
    const entries = buildTagMenu({ id: "t1", title: "work" }, baseDeps(confirmSpy(true)));
    expect(labels(entries)).toEqual(["Pin to sidebar", "─", "Rename…", "Delete tag"]);
    expect(entries.find((e) => e.id === "delete")!.danger).toBe(true);
  });

  it("delete on cancel does not delete; on confirm it does", async () => {
    const cancelDeps = baseDeps(confirmSpy(false));
    await runById(buildTagMenu({ id: "t1", title: "work" }, cancelDeps), "delete");
    expect(cancelDeps.deleteTag).not.toHaveBeenCalled();

    const okDeps = baseDeps(confirmSpy(true));
    await runById(buildTagMenu({ id: "t1", title: "work" }, okDeps), "delete");
    expect(okDeps.deleteTag).toHaveBeenCalledWith("t1");
  });

  it("rename wires through with id + title", async () => {
    const deps = baseDeps(confirmSpy(true));
    await runById(buildTagMenu({ id: "t1", title: "work" }, deps), "rename");
    expect(deps.rename).toHaveBeenCalledWith("t1", "work");
  });
});

describe("buildColorRowMenu", () => {
  const baseDeps = (confirm: ConfirmFn) => ({
    rename: vi.fn(),
    confirm,
    deleteColor: vi.fn(),
    toggleShortcut: vi.fn(),
    isShortcut: vi.fn(() => false)
  });
  const target = { id: "c1", title: "Red", colorCode: "#f00" };

  it("emits pin / sep / rename / sep / delete", () => {
    const entries = buildColorRowMenu(target, baseDeps(confirmSpy(true)));
    expect(labels(entries)).toEqual([
      "Pin to sidebar",
      "─",
      "Rename…",
      "─",
      "Delete color"
    ]);
    expect(entries.find((e) => e.id === "delete")!.danger).toBe(true);
  });

  it("pin label flips to Unpin + checked when already favorited", () => {
    const deps = baseDeps(confirmSpy(true));
    deps.isShortcut = vi.fn(() => true);
    const entries = buildColorRowMenu(target, deps);
    const pin = entries.find((e) => e.id === "toggle-shortcut")!;
    expect(pin.label).toBe("Unpin from sidebar");
    expect(pin.checked).toBe(true);
  });

  it("toggle-shortcut onSelect calls deps.toggleShortcut with the id", async () => {
    const deps = baseDeps(confirmSpy(true));
    await runById(buildColorRowMenu(target, deps), "toggle-shortcut");
    expect(deps.toggleShortcut).toHaveBeenCalledWith("c1");
  });

  it("rename onSelect calls deps.rename with id + title", async () => {
    const deps = baseDeps(confirmSpy(true));
    await runById(buildColorRowMenu(target, deps), "rename");
    expect(deps.rename).toHaveBeenCalledWith("c1", "Red");
  });

  it("delete on cancel does not delete; on confirm it calls deleteColor with the id", async () => {
    const cancelDeps = baseDeps(confirmSpy(false));
    await runById(buildColorRowMenu(target, cancelDeps), "delete");
    expect(cancelDeps.deleteColor).not.toHaveBeenCalled();

    const okDeps = baseDeps(confirmSpy(true));
    await runById(buildColorRowMenu(target, okDeps), "delete");
    expect(okDeps.deleteColor).toHaveBeenCalledWith("c1");
  });

  it("delete confirm message includes the color title", async () => {
    const deps = baseDeps(confirmSpy(true));
    await runById(buildColorRowMenu({ id: "c1", title: "Urgent", colorCode: "#f00" }, deps), "delete");
    expect(deps.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Delete color" }));
    expect(deps.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("Urgent") })
    );
  });
});

describe("buildShortcutMenu", () => {
  it("emits open / sep / remove", () => {
    const deps = { open: vi.fn(), removeShortcut: vi.fn() };
    const entries = buildShortcutMenu({ id: "s1", type: "tag", title: "work" }, deps);
    expect(labels(entries)).toEqual(["Open", "─", "Remove from shortcuts"]);
  });

  it("open onSelect passes the shortcut target through", async () => {
    const deps = { open: vi.fn(), removeShortcut: vi.fn() };
    const target = { id: "s1", type: "notebook" as const, title: "Work" };
    await runById(buildShortcutMenu(target, deps), "open");
    expect(deps.open).toHaveBeenCalledWith(target);
  });

  it("remove onSelect calls removeShortcut with the item id", async () => {
    const deps = { open: vi.fn(), removeShortcut: vi.fn() };
    await runById(buildShortcutMenu({ id: "s1", type: "tag", title: "x" }, deps), "remove");
    expect(deps.removeShortcut).toHaveBeenCalledWith("s1");
  });

  it("a favourite-note target relabels remove to 'Remove from favourites'", () => {
    const deps = { open: vi.fn(), removeShortcut: vi.fn() };
    const target = { id: "n1", type: "note" as const, title: "My note" };
    const entries = buildShortcutMenu(target, deps);
    expect(labels(entries)).toEqual(["Open", "─", "Remove from favourites"]);
  });

  it("note-target open passes the note target through", async () => {
    const deps = { open: vi.fn(), removeShortcut: vi.fn() };
    const target = { id: "n1", type: "note" as const, title: "My note" };
    await runById(buildShortcutMenu(target, deps), "open");
    expect(deps.open).toHaveBeenCalledWith(target);
  });
});

describe("buildSidebarSectionMenu", () => {
  it("shows a single 'Reset manual order' entry, enabled when a manual order exists", () => {
    const reset = vi.fn();
    const entries = buildSidebarSectionMenu("notebooks", {
      hasManualOrder: true,
      resetOrder: reset
    });
    expect(labels(entries)).toEqual(["Reset manual order"]);
    expect(entries[0].disabled).toBeFalsy();
  });

  it("disables the entry when no manual order is stored", () => {
    const entries = buildSidebarSectionMenu("colors", {
      hasManualOrder: false,
      resetOrder: vi.fn()
    });
    expect(entries[0].disabled).toBe(true);
  });

  it("onSelect calls the provided resetOrder", async () => {
    const reset = vi.fn();
    await runById(
      buildSidebarSectionMenu("notebooks", { hasManualOrder: true, resetOrder: reset }),
      "reset-order"
    );
    expect(reset).toHaveBeenCalled();
  });
});

/** A multi-selection target with empty all-have-it sets + no shared color. */
function multiSel(over: Partial<MultiMenuSelection> = {}): MultiMenuSelection {
  return {
    ids: ["n1", "n2", "n3"],
    tagAllHave: new Set<string>(),
    notebookAllHave: new Set<string>(),
    colorId: null,
    ...over
  };
}

/** Full MultiNoteMenuDeps fixture with spy callbacks + sample colors/tags/notebooks. */
function baseMultiDeps() {
  return {
    confirm: vi.fn(() => Promise.resolve(true)) as unknown as ConfirmFn & ReturnType<typeof vi.fn>,
    deleteMany: vi.fn(),
    setPinned: vi.fn(),
    setFavorite: vi.fn(),
    colors: [
      { id: "red", title: "Red", colorCode: "#f00" },
      { id: "blue", title: "Blue", colorCode: "#00f" }
    ],
    presetColors: [{ id: "green", title: "Green", colorCode: "#008000" }],
    setColorMany: vi.fn(),
    clearColorMany: vi.fn(),
    assignPresetColorMany: vi.fn(),
    createColorMany: vi.fn(),
    tags: [
      { id: "t1", title: "work" },
      { id: "t2", title: "personal" }
    ],
    addTagToMany: vi.fn(),
    removeTagToMany: vi.fn(),
    createTagMany: vi.fn(),
    notebooks: [
      { id: "b1", title: "Projects" },
      { id: "b2", title: "Inbox" }
    ],
    addToNotebookMany: vi.fn(),
    removeFromNotebookMany: vi.fn(),
    createNotebookMany: vi.fn(),
    duplicateMany: vi.fn(),
    archiveMany: vi.fn()
  };
}
type MultiDeps = ReturnType<typeof baseMultiDeps>;
function multiDeps(over: Partial<MultiDeps> = {}): MultiDeps {
  return { ...baseMultiDeps(), ...over };
}

describe("buildMultiNoteMenu", () => {
  it("emits Pin/Unpin/Favorite/Unfavorite + Color/Tags/Notebooks submenus + Duplicate + Move to trash", () => {
    const entries = buildMultiNoteMenu(multiSel(), multiDeps());
    expect(labels(entries)).toEqual([
      "Pin to top",
      "Unpin",
      "Favorite",
      "Unfavorite",
      "─",
      "Color",
      "Tags",
      "Notebooks",
      "─",
      "Duplicate",
      "Archive",
      "Move to trash"
    ]);
    // Single-note-only entries are absent.
    expect(labels(entries)).not.toContain("Open in new window");
  });

  it("Archive calls archiveNote / archiveMany with the note ids", async () => {
    const deps = noteDeps();
    await runById(buildNoteMenu(noteTarget(), deps), "archive");
    expect(deps.archiveNote).toHaveBeenCalledWith("n1");

    const mDeps = multiDeps();
    const sel = multiSel({ ids: ["a", "b"] });
    await runById(buildMultiNoteMenu(sel, mDeps), "archive");
    expect(mDeps.archiveMany).toHaveBeenCalledWith(["a", "b"]);
  });

  it("Pin / Unpin call setPinned with the explicit state + the full id list", async () => {
    const deps = multiDeps();
    const sel = multiSel({ ids: ["a", "b"] });
    await runById(buildMultiNoteMenu(sel, deps), "pin");
    expect(deps.setPinned).toHaveBeenCalledWith(["a", "b"], true);
    await runById(buildMultiNoteMenu(sel, deps), "unpin");
    expect(deps.setPinned).toHaveBeenCalledWith(["a", "b"], false);
  });

  it("Duplicate calls duplicateMany with the ids", async () => {
    const deps = multiDeps();
    const sel = multiSel({ ids: ["a", "b"] });
    await runById(buildMultiNoteMenu(sel, deps), "duplicate");
    expect(deps.duplicateMany).toHaveBeenCalledWith(["a", "b"]);
  });

  it("Move to trash shows a count-aware confirm then calls deleteMany only on ok", async () => {
    const deps = multiDeps({ confirm: confirmSpy(false) });
    const sel = multiSel({ ids: ["a", "b", "c"] });
    await runById(buildMultiNoteMenu(sel, deps), "delete");
    expect(deps.confirm).toHaveBeenCalledOnce();
    const opts = (deps.confirm as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opts.message).toContain("3 notes");
    expect(opts.danger).toBe(true);
    expect(deps.deleteMany).not.toHaveBeenCalled();

    // On ok it deletes the full selection.
    const okDeps = multiDeps({ confirm: confirmSpy(true) });
    await runById(buildMultiNoteMenu(sel, okDeps), "delete");
    expect(okDeps.deleteMany).toHaveBeenCalledWith(["a", "b", "c"]);
  });
});

describe("buildMultiTagsSubmenu", () => {
  it("tags all-selected notes have are checked and remove; others add", () => {
    const deps = multiDeps();
    const sel = multiSel({ tagAllHave: new Set(["t1"]) });
    const spec = buildMultiTagsSubmenu(sel, deps);
    const items = spec.build("");
    const t1 = items.find((i) => i.id === "t1")!;
    const t2 = items.find((i) => i.id === "t2")!;
    expect(t1.checked).toBe(true); // all have t1 → remove path
    expect(t1.keepOpen).toBe(true);
    expect(t2.checked).toBe(false); // not all have t2 → add path
  });

  it("toggle direction: all-have → removeTagToMany, otherwise addTagToMany", async () => {
    const deps = multiDeps();
    const sel = multiSel({ ids: ["a", "b"], tagAllHave: new Set(["t1"]) });
    const spec = buildMultiTagsSubmenu(sel, deps);
    const items = spec.build("");
    const t1 = items.find((i) => i.id === "t1")!;
    const t2 = items.find((i) => i.id === "t2")!;
    await t1.onSelect!();
    expect(deps.removeTagToMany).toHaveBeenCalledWith("t1", ["a", "b"]);
    await t2.onSelect!();
    expect(deps.addTagToMany).toHaveBeenCalledWith("t2", ["a", "b"]);
  });

  it("offers Create <q> for a non-empty, non-matching query", () => {
    const deps = multiDeps();
    const sel = multiSel();
    const spec = buildMultiTagsSubmenu(sel, deps);
    const items = spec.build("urgent");
    const create = items.find((i) => i.id === "create-tag");
    expect(create).toBeDefined();
    expect(create!.label).toContain("“urgent”");
  });
});

describe("buildMultiNotebooksSubmenu", () => {
  it("toggle direction: all-have → removeFromNotebookMany, otherwise addToNotebookMany", async () => {
    const deps = multiDeps();
    const sel = multiSel({ ids: ["a", "b"], notebookAllHave: new Set(["b1"]) });
    const spec = buildMultiNotebooksSubmenu(sel, deps);
    const items = spec.build("");
    const b1 = items.find((i) => i.id === "b1")!;
    const b2 = items.find((i) => i.id === "b2")!;
    await b1.onSelect!();
    expect(deps.removeFromNotebookMany).toHaveBeenCalledWith("b1", ["a", "b"]);
    await b2.onSelect!();
    expect(deps.addToNotebookMany).toHaveBeenCalledWith("b2", ["a", "b"]);
  });
});

describe("buildMultiColorSubmenu", () => {
  it("No color is checked when there is no shared color and clears all", async () => {
    const deps = multiDeps();
    const sel = multiSel({ ids: ["a", "b"], colorId: null });
    const spec = buildMultiColorSubmenu(sel, deps);
    const items = spec.build("");
    const noColor = items.find((i) => i.id === "no-color")!;
    expect(noColor.checked).toBe(true);
    await noColor.onSelect!();
    expect(deps.clearColorMany).toHaveBeenCalledWith(["a", "b"]);
  });

  it("a shared color swatch is checked and assigns to all", async () => {
    const deps = multiDeps();
    const sel = multiSel({ ids: ["a", "b"], colorId: "red" });
    const spec = buildMultiColorSubmenu(sel, deps);
    const items = spec.build("");
    const red = items.find((i) => i.id === "red")!;
    expect(red.checked).toBe(true);
    await red.onSelect!();
    expect(deps.setColorMany).toHaveBeenCalledWith("red", ["a", "b"]);
  });

  it("picks close the menu (no keepOpen) — color is single-select", () => {
    const deps = multiDeps();
    const sel = multiSel();
    const items = buildMultiColorSubmenu(sel, deps).build("");
    expect(items.every((i) => !i.keepOpen)).toBe(true);
  });
});