// @vitest-environment happy-dom
/**
 * Contract tests for `@notesnook-vue/ui-vue` (Phase 2.3 Vue-Primitives).
 *
 * Mounts each primitive via `@vue/test-utils` under happy-dom and asserts the
 * rendered **class strings, attributes, emitted events, and inline `style`
 * text** — never computed colors. happy-dom can't resolve CSS custom
 * properties through `getComputedStyle` (same constraint documented in
 * `theme.spec.ts`), and the token utilities (`bg-surface`, `text-text`, …)
 * resolve via the renderer's global `@theme inline` stylesheet, which isn't
 * loaded here. So these tests verify the *contract* the primitives emit
 * (which utility classes / attrs / vars they produce), not their visual
 * rendering — that is the on-site runtime-check gate.
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { Box, Flex, Text, Button, Input, Icon, Surface, glassStyle } from "@notesnook-vue/ui-vue";

function classesOf(el: Element): string {
  return el.getAttribute("class") ?? "";
}

describe("Button", () => {
  it("renders a <button type=\"button\"> by default", () => {
    const w = mount(Button, { slots: { default: "Save" } });
    const btn = w.element;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("type")).toBe("button");
    expect(w.text()).toBe("Save");
  });

  it("applies the primary variant token classes", () => {
    const w = mount(Button, { props: { variant: "primary" } });
    expect(classesOf(w.element)).toContain("bg-accent");
    expect(classesOf(w.element)).toContain("text-accent-foreground");
  });

  it("applies the secondary variant token classes", () => {
    const w = mount(Button, { props: { variant: "secondary" } });
    const c = classesOf(w.element);
    expect(c).toContain("bg-surface");
    expect(c).toContain("border-border");
    expect(c).toContain("hover:bg-hover");
  });

  it("maps sizes to height utilities", () => {
    expect(classesOf(mount(Button, { props: { size: "sm" } }).element)).toContain("h-7");
    expect(classesOf(mount(Button, { props: { size: "lg" } }).element)).toContain("h-11");
  });

  it("iconOnly makes a square centered button", () => {
    const c = classesOf(mount(Button, { props: { iconOnly: true, size: "md" } }).element);
    expect(c).toContain("w-9");
    expect(c).toContain("place-items-center");
    expect(c).toContain("p-0");
    // text-* size class is dropped for iconOnly
    expect(c).not.toContain("text-sm");
  });

  it("block adds w-full", () => {
    expect(classesOf(mount(Button, { props: { block: true } }).element)).toContain("w-full");
  });

  it("disabled sets the attribute and the disabled: utility", () => {
    const w = mount(Button, { props: { disabled: true } });
    expect(w.element.hasAttribute("disabled")).toBe(true);
    expect(classesOf(w.element)).toContain("disabled:opacity-50");
  });

  it("forwards type and emits click", async () => {
    const w = mount(Button, { props: { type: "submit" } });
    expect(w.element.getAttribute("type")).toBe("submit");
    await w.trigger("click");
    expect(w.emitted("click")).toBeTruthy();
    expect((w.emitted("click")![0]![0] as MouseEvent).type).toBe("click");
  });
});

describe("Input", () => {
  it("v-model round-trips via update:modelValue", async () => {
    const w = mount(Input, { props: { modelValue: "hi" } });
    const input = w.element as HTMLInputElement;
    expect(input.value).toBe("hi");
    // Simulate typing: set DOM value + dispatch input.
    input.value = "hello";
    input.dispatchEvent(new Event("input"));
    await w.vm.$nextTick();
    const events = w.emitted("update:modelValue");
    expect(events).toBeTruthy();
    expect(events![events!.length - 1]![0]).toBe("hello");
  });

  it("forwards placeholder/type and defaults type to text", () => {
    const w = mount(Input, { attrs: { placeholder: "Search…" } });
    const input = w.element as HTMLInputElement;
    expect(input.getAttribute("placeholder")).toBe("Search…");
    expect(input.getAttribute("type")).toBe("text");
  });

  it("error variant borders with --red-static", () => {
    expect(classesOf(mount(Input, { props: { variant: "error" } }).element)).toContain(
      "border-[var(--red-static)]"
    );
  });

  it("default variant borders with the border token", () => {
    expect(classesOf(mount(Input, { props: { variant: "default" } }).element)).toContain("border-border");
  });

  it("maps size to height", () => {
    expect(classesOf(mount(Input, { props: { size: "sm" } }).element)).toContain("h-7");
    expect(classesOf(mount(Input, { props: { size: "lg" } }).element)).toContain("h-11");
  });

  it("block adds w-full", () => {
    expect(classesOf(mount(Input, { props: { block: true } }).element)).toContain("w-full");
  });
});

describe("Text", () => {
  it("variant maps to token color utilities", () => {
    expect(classesOf(mount(Text, { props: { variant: "heading" } }).element)).toContain("text-heading");
    expect(classesOf(mount(Text, { props: { variant: "muted" } }).element)).toContain("text-text-muted");
    expect(classesOf(mount(Text, { props: { variant: "accent" } }).element)).toContain("text-accent");
    // default body
    expect(classesOf(mount(Text).element)).toContain("text-text");
  });

  it("size maps to text-* utilities", () => {
    expect(classesOf(mount(Text, { props: { size: "xl" } }).element)).toContain("text-xl");
    expect(classesOf(mount(Text, { props: { size: "2xl" } }).element)).toContain("text-2xl");
  });

  it("weight maps to font-* utilities", () => {
    expect(classesOf(mount(Text, { props: { weight: "bold" } }).element)).toContain("font-bold");
  });

  it("is polymorphic via as", () => {
    expect(mount(Text, { props: { as: "h1" } }).element.tagName).toBe("H1");
  });
});

describe("Flex", () => {
  it("direction maps to flex-col/row utilities", () => {
    expect(classesOf(mount(Flex, { props: { direction: "column" } }).element)).toContain("flex-col");
    expect(classesOf(mount(Flex).element)).toContain("flex-row");
  });

  it("gap maps to gap-* utility", () => {
    expect(classesOf(mount(Flex, { props: { gap: 4 } }).element)).toContain("gap-4");
  });

  it("justify/align map to utilities", () => {
    const c = classesOf(mount(Flex, { props: { justify: "between", align: "center" } }).element);
    expect(c).toContain("justify-between");
    expect(c).toContain("items-center");
  });

  it("inline selects inline-flex over flex", () => {
    expect(classesOf(mount(Flex, { props: { inline: true } }).element)).toContain("inline-flex");
    expect(classesOf(mount(Flex).element)).toContain("flex");
    expect(classesOf(mount(Flex).element)).not.toContain("inline-flex");
  });

  it("wrap adds flex-wrap", () => {
    expect(classesOf(mount(Flex, { props: { wrap: true } }).element)).toContain("flex-wrap");
  });
});

describe("Box", () => {
  it("glass sets the glassmorphism inline style (backdrop-filter renders in happy-dom)", () => {
    const w = mount(Box, { props: { glass: true } });
    const style = w.element.getAttribute("style") ?? "";
    expect(style).toContain("backdrop-filter: blur(var(--backdrop-blur-base))");
  });

  it("without glass there is no glass inline style", () => {
    expect(mount(Box).element.getAttribute("style")).toBeNull();
  });

  it("is polymorphic via as", () => {
    expect(mount(Box, { props: { as: "section" } }).element.tagName).toBe("SECTION");
  });
});

describe("Surface", () => {
  it("default applies the backdrop-filter", () => {
    const style = mount(Surface).element.getAttribute("style") ?? "";
    expect(style).toContain("backdrop-filter: blur(var(--backdrop-blur-base))");
  });

  it("blur=false drops the backdrop-filter", () => {
    const style = mount(Surface, { props: { blur: false } }).element.getAttribute("style") ?? "";
    expect(style).not.toContain("backdrop-filter");
  });

  it("opacity=false keeps the backdrop-filter", () => {
    const style = mount(Surface, { props: { opacity: false } }).element.getAttribute("style") ?? "";
    expect(style).toContain("backdrop-filter: blur(var(--backdrop-blur-base))");
  });

  it("blur=false opacity=false yields no inline style", () => {
    expect(mount(Surface, { props: { blur: false, opacity: false } }).element.getAttribute("style")).toBeNull();
  });
});

describe("glassStyle (theme-var contract)", () => {
  // Unit-tested directly (no DOM) because happy-dom's CSS parser drops
  // `color-mix()` values when set via `element.style.background`, so the
  // `background` half of the recipe isn't visible in the mount-style string.
  // The function output is the authoritative contract; Chromium renders it.
  it("defaults produce both effects reading the theme vars", () => {
    const s = glassStyle();
    expect(s).toBeTruthy();
    expect(s!.backdropFilter).toBe("blur(var(--backdrop-blur-base))");
    expect(s!.background).toContain("color-mix(in srgb, var(--background)");
    expect(s!.background).toContain("var(--nn-surface-opacity)");
    expect(s!.background).toContain("transparent");
  });

  it("blur=false drops backdropFilter but keeps background", () => {
    const s = glassStyle({ blur: false });
    expect(s!.backdropFilter).toBeUndefined();
    expect(s!.background).toContain("color-mix(in srgb, var(--background)");
  });

  it("opacity=false drops background but keeps backdropFilter", () => {
    const s = glassStyle({ opacity: false });
    expect(s!.backdropFilter).toBe("blur(var(--backdrop-blur-base))");
    expect(s!.background).toBeUndefined();
  });

  it("both false yields undefined", () => {
    expect(glassStyle({ blur: false, opacity: false })).toBeUndefined();
  });
});

describe("Icon", () => {
  it("renders an svg with the path and default 18px size", () => {
    const w = mount(Icon, { props: { path: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" } });
    const svg = w.element;
    expect(svg.tagName).toBe("svg");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("width")).toBe("18");
    expect(svg.getAttribute("height")).toBe("18");
    expect(svg.getAttribute("fill")).toBe("currentColor");
    const path = svg.querySelector("path");
    expect(path).toBeTruthy();
    expect(path!.getAttribute("d")).toBe("M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z");
  });

  it("accepts a numeric size", () => {
    const svg = mount(Icon, { props: { path: "M0 0", size: 20 } }).element;
    expect(svg.getAttribute("width")).toBe("20");
    expect(svg.getAttribute("height")).toBe("20");
  });

  it("title makes it accessible; without title it is aria-hidden", () => {
    const titled = mount(Icon, { props: { path: "M0 0", title: "Add" } });
    expect(titled.element.getAttribute("role")).toBe("img");
    expect(titled.element.getAttribute("aria-hidden")).toBeNull();
    expect(titled.element.querySelector("title")?.textContent).toBe("Add");

    const untitled = mount(Icon, { props: { path: "M0 0" } });
    expect(untitled.element.getAttribute("role")).toBeNull();
    expect(untitled.element.getAttribute("aria-hidden")).toBe("true");
    expect(untitled.element.querySelector("title")).toBeNull();
  });

  it("spin adds animate-spin", () => {
    expect(classesOf(mount(Icon, { props: { path: "M0 0", spin: true } }).element)).toContain("animate-spin");
  });
});

describe("class merge (tailwind-merge)", () => {
  it("caller classes override primitive defaults", () => {
    // md size default is px-3; caller px-6 must win (px-3 dropped).
    const c = classesOf(mount(Button, { props: { size: "md" }, attrs: { class: "px-6" } }).element);
    expect(c).toContain("px-6");
    expect(c).not.toContain("px-3");
  });

  it("caller classes are appended when non-conflicting", () => {
    const c = classesOf(mount(Text, { attrs: { class: "mt-2" } }).element);
    expect(c).toContain("mt-2");
    expect(c).toContain("text-text"); // base still present
  });

  it("Flex caller class merges with computed flex classes", () => {
    const c = classesOf(mount(Flex, { props: { direction: "column" }, attrs: { class: "p-4" } }).element);
    expect(c).toContain("flex-col");
    expect(c).toContain("p-4");
  });
});