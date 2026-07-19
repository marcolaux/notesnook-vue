// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { SlashMenu, SLASH_ITEMS, filterSlashItems, type SlashItem } from "@notesnook-vue/editor-vue";

function rect(): DOMRect {
  return { bottom: 100, left: 10, top: 80, right: 250, width: 240, height: 20 } as DOMRect;
}

function mountMenu(items: SlashItem[], command: (i: SlashItem) => void) {
  return mount(SlashMenu, {
    props: { items, command, clientRect: () => rect() }
  });
}

function items(): NodeListOf<HTMLElement> {
  return document.body.querySelectorAll<HTMLElement>(".slash-item");
}

describe("SlashMenu.vue", () => {
  let wrapper: ReturnType<typeof mountMenu>;

  afterEach(() => {
    wrapper?.unmount();
    document.body.innerHTML = "";
  });

  it("renders a button per item (teleported to body)", () => {
    wrapper = mountMenu(SLASH_ITEMS, () => {});
    expect(items().length).toBe(SLASH_ITEMS.length);
  });

  it("first item is active initially", () => {
    wrapper = mountMenu(SLASH_ITEMS, () => {});
    const active = document.body.querySelector<HTMLElement>(".slash-item--active");
    expect(active?.textContent).toBe(SLASH_ITEMS[0].title);
  });

  it("exposed next()/prev() move the active row with wrapping", async () => {
    wrapper = mountMenu(SLASH_ITEMS, () => {});
    const vm = wrapper.vm as unknown as { next: () => void; prev: () => void };
    vm.next();
    await nextTick();
    expect(document.body.querySelector<HTMLElement>(".slash-item--active")?.textContent).toBe(
      SLASH_ITEMS[1].title
    );
    vm.prev();
    await nextTick();
    expect(document.body.querySelector<HTMLElement>(".slash-item--active")?.textContent).toBe(
      SLASH_ITEMS[0].title // back to first
    );
    vm.prev();
    await nextTick();
    expect(document.body.querySelector<HTMLElement>(".slash-item--active")?.textContent).toBe(
      SLASH_ITEMS[SLASH_ITEMS.length - 1].title // wrap to last
    );
  });

  it("exposed selectActive() invokes command with the active item", () => {
    const command = vi.fn();
    wrapper = mountMenu(SLASH_ITEMS, command);
    const vm = wrapper.vm as unknown as { next: () => void; selectActive: () => void };
    vm.next(); // active = items[1]
    vm.selectActive();
    expect(command).toHaveBeenCalledWith(SLASH_ITEMS[1]);
  });

  it("clicking an item invokes command with that item and sets it active", () => {
    const command = vi.fn();
    wrapper = mountMenu(SLASH_ITEMS, command);
    const els = items();
    els[2].click();
    expect(command).toHaveBeenCalledWith(SLASH_ITEMS[2]);
  });

  it("renders nothing when the item list is empty", () => {
    wrapper = mountMenu([], () => {});
    expect(items().length).toBe(0);
  });
});

describe("filterSlashItems", () => {
  it("subsequence-matches and keeps slash items", () => {
    expect(filterSlashItems(SLASH_ITEMS, "code").map((a) => a.id)).toContain("codeBlock");
    expect(filterSlashItems(SLASH_ITEMS, "hr").map((a) => a.id)).toContain("horizontalRule");
    expect(filterSlashItems(SLASH_ITEMS, "").length).toBe(SLASH_ITEMS.length);
  });
});