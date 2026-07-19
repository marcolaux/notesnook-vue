// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import CommandPalette from "@/components/CommandPalette.vue";
import { useCommandPaletteStore } from "@/stores/command-palette";
import { registerCommands, clearCommands, type Command } from "@/commands/registry";

// notes.ts imports getDatabase from bootstrap; stub it so the platform graph
// (sodium/crypto/bridge) isn't pulled into a pure overlay-mount test.
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => ({}),
  bootstrap: vi.fn()
}));

// Build a fresh command set with captured spies so tests can assert which
// command ran without mutating the registry mid-test (the palette store's
// `items` computed caches `visibleCommands`, which reads the module `Map` once
// per evaluation — mid-test re-registration would not propagate).
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
  return document.body.querySelector<HTMLInputElement>(".command-palette__input");
}
function rows(): NodeListOf<HTMLElement> {
  return document.body.querySelectorAll<HTMLElement>(".command-palette__item");
}
function activeRow(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(".command-palette__item.is-active");
}
function emptyState(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(".command-palette__empty");
}
function fireKey(el: Element, key: string): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}
function type(el: HTMLInputElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("CommandPalette.vue", () => {
  let wrapper: ReturnType<typeof mount>;
  let palette: ReturnType<typeof useCommandPaletteStore>;
  let cmds: Command[];

  beforeEach(() => {
    setActivePinia(createPinia());
    clearCommands();
    cmds = fakeCommands();
    registerCommands(cmds);
    palette = useCommandPaletteStore();
    wrapper = mount(CommandPalette, { attachTo: document.body });
  });

  afterEach(() => {
    wrapper?.unmount();
    document.body.innerHTML = "";
  });

  const runOf = (id: string) => cmds.find((c) => c.id === id)!.run as ReturnType<typeof vi.fn>;

  it("renders nothing while closed", () => {
    expect(rows().length).toBe(0);
    expect(inputEl()).toBeNull();
  });

  it("renders an input + a row per visible item when open, first row active", async () => {
    palette.openPalette();
    await nextTick();
    // editor undefined → needs-editor hidden → 2 visible (alpha, new-note)
    expect(rows().length).toBe(2);
    expect(inputEl()).not.toBeNull();
    expect(activeRow()?.textContent).toContain("Always visible");
  });

  it("autofocuses the input when opened", async () => {
    palette.openPalette();
    await nextTick();
    expect(document.activeElement).toBe(inputEl());
  });

  it("typing filters the list via setQuery", async () => {
    palette.openPalette();
    await nextTick();
    type(inputEl()!, "new");
    await nextTick();
    expect(rows().length).toBe(1);
    expect(rows()[0].textContent).toContain("New note");
  });

  it("ArrowDown/ArrowUp move the active row with wrapping", async () => {
    palette.openPalette();
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

  it("Enter runs the active command and closes the palette", async () => {
    palette.openPalette();
    await nextTick();
    fireKey(inputEl()!, "Enter");
    await nextTick();
    expect(runOf("alpha")).toHaveBeenCalledOnce();
    expect(runOf("new-note")).not.toHaveBeenCalled();
    expect(palette.open).toBe(false);
  });

  it("Escape closes the palette", async () => {
    palette.openPalette();
    await nextTick();
    fireKey(inputEl()!, "Escape");
    await nextTick();
    expect(palette.open).toBe(false);
  });

  it("hover sets the active row; click runs that command", async () => {
    palette.openPalette();
    await nextTick();
    rows()[1].dispatchEvent(new Event("mouseenter", { bubbles: true }));
    await nextTick();
    expect(activeRow()?.textContent).toContain("New note");
    rows()[1].click();
    await nextTick();
    expect(runOf("new-note")).toHaveBeenCalledOnce();
    expect(runOf("alpha")).not.toHaveBeenCalled();
    expect(palette.open).toBe(false);
  });

  it("shows an empty state when the query matches nothing", async () => {
    palette.openPalette();
    await nextTick();
    type(inputEl()!, "zzz");
    await nextTick();
    expect(rows().length).toBe(0);
    expect(emptyState()?.textContent).toContain("No matching commands");
  });
});