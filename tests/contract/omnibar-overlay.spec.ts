// @vitest-environment happy-dom
/**
 * Omnibar overlay contract tests — mount the title-bar `GlobalSearchInput`
 * (which hosts the teleported `OmnibarDropdown`) and assert prefix-mode
 * switching, row rendering, keyboard nav, and the "Search notes" third-flow.
 *
 * Migrated from the former `command-palette-overlay.spec.ts` (which mounted the
 * centered `CommandPalette`); the palette now lives in the title-bar dropdown.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import GlobalSearchInput from "@/components/GlobalSearchInput.vue";
import { useOmnibarStore } from "@/stores/omnibar";
import { useCollectionsStore } from "@/stores/collections";
import { registerCommands, clearCommands, type Command } from "@/commands/registry";

// The omnibar store imports `getDatabase` + `goToCollection`; stub both so the
// platform graph (sodium/crypto/bridge) + the router/db aren't pulled in.
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => ({}),
  bootstrap: vi.fn()
}));
vi.mock("@/utils/collection-nav", () => ({
  goToCollection: vi.fn()
}));

function fakeCommands(): Command[] {
  return [
    { id: "alpha", title: "Always visible", keywords: ["a"], group: "app", run: vi.fn() },
    {
      id: "needs-editor",
      title: "Editor action",
      keywords: ["bold"],
      group: "editor",
      when: (ctx) => !!ctx.editor,
      run: vi.fn()
    },
    { id: "new-note", title: "New note", keywords: ["create"], group: "app", run: vi.fn() }
  ];
}

function inputEl(): HTMLInputElement | null {
  return document.body.querySelector<HTMLInputElement>(".global-search__input");
}
function rows(): NodeListOf<HTMLElement> {
  return document.body.querySelectorAll<HTMLElement>(".omnibar-dropdown__item");
}
function activeRow(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(".omnibar-dropdown__item.is-active");
}
function emptyState(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(".omnibar-dropdown__empty");
}
function footer(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(".omnibar-dropdown__footer");
}
function fireKey(el: Element, key: string): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}
function type(el: HTMLInputElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("GlobalSearchInput + OmnibarDropdown", () => {
  let wrapper: ReturnType<typeof mount>;
  let omnibar: ReturnType<typeof useOmnibarStore>;
  let cmds: Command[];

  beforeEach(() => {
    setActivePinia(createPinia());
    clearCommands();
    cmds = fakeCommands();
    registerCommands(cmds);
    omnibar = useOmnibarStore();
    wrapper = mount(GlobalSearchInput, { attachTo: document.body });
  });

  afterEach(() => {
    wrapper?.unmount();
    document.body.innerHTML = "";
  });

  const runOf = (id: string) => cmds.find((c) => c.id === id)!.run as ReturnType<typeof vi.fn>;

  it("renders nothing while closed", () => {
    expect(rows().length).toBe(0);
    expect(emptyState()).toBeNull();
  });

  it("openCommands renders an input + a row per visible command, first row active", async () => {
    omnibar.openCommands();
    await nextTick();
    // editor undefined → needs-editor hidden → 2 visible (alpha, new-note)
    expect(rows().length).toBe(2);
    expect(inputEl()).not.toBeNull();
    expect(activeRow()?.textContent).toContain("Always visible");
  });

  it("autofocuses the input when opened", async () => {
    omnibar.openCommands();
    await nextTick();
    expect(document.activeElement).toBe(inputEl());
  });

  it("typing filters the command list via setQuery", async () => {
    omnibar.openCommands();
    await nextTick();
    type(inputEl()!, ">new");
    await nextTick();
    expect(rows().length).toBe(1);
    expect(rows()[0].textContent).toContain("New note");
  });

  it("ArrowDown/ArrowUp move the active row with wrapping", async () => {
    omnibar.openCommands();
    await nextTick();
    const input = inputEl()!;
    fireKey(input, "ArrowDown");
    await nextTick();
    expect(activeRow()?.textContent).toContain("New note");
    fireKey(input, "ArrowDown"); // wraps back to first
    await nextTick();
    expect(activeRow()?.textContent).toContain("Always visible");
    fireKey(input, "ArrowUp"); // wraps to last
    await nextTick();
    expect(activeRow()?.textContent).toContain("New note");
  });

  it("Enter runs the active command and closes the omnibar", async () => {
    omnibar.openCommands();
    await nextTick();
    fireKey(inputEl()!, "Enter");
    await nextTick();
    expect(runOf("alpha")).toHaveBeenCalledOnce();
    expect(runOf("new-note")).not.toHaveBeenCalled();
    expect(omnibar.open).toBe(false);
  });

  it("Escape closes the omnibar", async () => {
    omnibar.openCommands();
    await nextTick();
    fireKey(inputEl()!, "Escape");
    await nextTick();
    expect(omnibar.open).toBe(false);
  });

  it("hover sets the active row; click runs that command", async () => {
    omnibar.openCommands();
    await nextTick();
    rows()[1].dispatchEvent(new Event("mouseenter", { bubbles: true }));
    await nextTick();
    expect(activeRow()?.textContent).toContain("New note");
    rows()[1].click();
    await nextTick();
    expect(runOf("new-note")).toHaveBeenCalledOnce();
    expect(runOf("alpha")).not.toHaveBeenCalled();
    expect(omnibar.open).toBe(false);
  });

  it("shows an empty state when the command query matches nothing", async () => {
    omnibar.openCommands();
    await nextTick();
    type(inputEl()!, ">zzz");
    await nextTick();
    expect(rows().length).toBe(0);
    expect(emptyState()?.textContent).toContain("No matching commands");
  });

  it("the notes-mode 'View all results' footer is absent in commands mode", async () => {
    omnibar.openCommands();
    await nextTick();
    expect(footer()).toBeNull();
  });

  it("prefix switching: `#` enters tags mode and renders tag rows", async () => {
    const collections = useCollectionsStore();
    collections.tags = [
      { id: "t1", title: "Work", dateCreated: 0, dateModified: 0 },
      { id: "t2", title: "Home", dateCreated: 0, dateModified: 0 }
    ];
    omnibar.openCommands(); // focus the field
    await nextTick();
    type(inputEl()!, "#work");
    await nextTick();
    expect(omnibar.mode).toBe("tags");
    expect(rows().length).toBe(1);
    expect(rows()[0].textContent).toContain("Work");
  });

  it("third-flow: picking 'Search notes' switches the open omnibar to notes mode", async () => {
    clearCommands();
    const spy = vi.fn();
    registerCommands([
      { id: "search-notes", title: "Search notes", group: "app", run: (ctx) => { spy(); ctx.omnibar.openNotes(); } }
    ]);
    omnibar.openCommands();
    await nextTick();
    // The only command is "Search notes" — Enter runs it.
    fireKey(inputEl()!, "Enter");
    await nextTick();
    expect(spy).toHaveBeenCalledOnce();
    expect(omnibar.mode).toBe("notes");
    expect(omnibar.open).toBe(true); // NOT closed — mode switched
    expect(omnibar.query).toBe("");
  });
});