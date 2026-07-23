// @vitest-environment happy-dom
/**
 * Proves the ToC click→heading lookup chain against a REAL TipTap editor DOM.
 * StarterKit's `Heading` assigns no ids, so `extractTableOfContents` derives
 * slug ids; `findHeading` must resolve those ids back to the live `<hN>`
 * elements so `scrollToHeading` can scroll to them. (The actual `scrollTop`
 * change can't be exercised in happy-dom — no layout — but the lookup +
 * `posAtDOM` + `setTextSelection` chain is verifiable, and that's the part that
 * was failing on-site.)
 */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { extractTableOfContents, findHeading, slugifyText } from "@/utils/toc";

function makeEditor(html: string): Editor {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return new Editor({
    element: el,
    extensions: [StarterKit.configure({ codeBlock: false })],
    content: html
  });
}

describe("slugifyText", () => {
  it("matches the slug extractTableOfContents derives", () => {
    expect(slugifyText("Hello World")).toBe("hello-world");
    expect(slugifyText("  Intro!! ")).toBe("intro");
    expect(slugifyText("A/B C")).toBe("a-b-c");
  });
});

describe("findHeading (real TipTap DOM)", () => {
  it("resolves ToC items to the live heading elements by text (ids stripped)", () => {
    const html = "<h1>Introduction</h1><p>body</p><h2>Sub Section</h2><h3>Deep</h3>";
    const toc = extractTableOfContents(html);

    const editor = makeEditor(html);
    const root = editor.view.dom;
    // The live DOM headings carry NO ids (StarterKit strips them on parse)…
    expect(root.querySelector("[id]")).toBeNull();
    // …so findHeading matches by the ToC item's text.
    for (const item of toc) {
      const h = findHeading(root, item.id, item.text);
      expect(h, `heading ${item.id}/${item.text}`).not.toBeNull();
      expect(h!.tagName.toLowerCase()).toBe(`h${item.level}`);
    }
    editor.destroy();
  });

  it("matches by text even when the ToC id is a positional id absent from the DOM (the on-site bug)", () => {
    // Upstream Notesnook assigns positional ids like `h425`; StarterKit strips
    // them on parse. The ToC id is `h425` but the live DOM has no such id —
    // findHeading must still resolve via the heading text.
    const html = '<h1 id="h425">Introduction</h1><p>body</p><h2 id="h429">Sub</h2>';
    const toc = extractTableOfContents(html);
    expect(toc.map((t) => t.id)).toEqual(["h425", "h429"]);

    const editor = makeEditor(html);
    const root = editor.view.dom;
    expect(root.querySelector("[id]")).toBeNull(); // stripped
    expect(findHeading(root, "h425", "Introduction")).not.toBeNull();
    expect(findHeading(root, "h429", "Sub")).not.toBeNull();
    editor.destroy();
  });

  it("returns null for an id with no matching heading + no text", () => {
    const editor = makeEditor("<h1>Only One</h1>");
    expect(findHeading(editor.view.dom, "does-not-exist")).toBeNull();
    expect(findHeading(editor.view.dom, "x", "No Such Text")).toBeNull();
    editor.destroy();
  });

  it("posAtDOM yields a valid doc position inside the heading (scrollToHeading chain)", () => {
    const editor = makeEditor("<h1>Introduction</h1><p>body</p>");
    const root = editor.view.dom;
    const h = findHeading(root, "introduction", "Introduction");
    expect(h).not.toBeNull();
    const pos = editor.view.posAtDOM(h!, 0);
    const doc = editor.state.doc;
    expect(pos).toBeGreaterThan(0);
    expect(pos).toBeLessThan(doc.content.size);
    expect(() => editor.commands.setTextSelection(pos)).not.toThrow();
    editor.destroy();
  });
});