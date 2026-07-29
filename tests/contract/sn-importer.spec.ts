// @vitest-environment node
/*
Unit tests for the Standard Notes (Lexical) → Notesnook (TipTap HTML) converter.
The converter is pure and takes stub `Resolvers`, so these tests need no db,
no Electron, no Pinia — they just assert the emitted HTML per Lexical node type.
*/
import { describe, it, expect, vi } from "vitest";
import { lexicalToTipTapHtml } from "@notesnook-vue/editor-vue";
import type { Resolvers, AttachmentRef, TagRef } from "@notesnook-vue/editor-vue";

/** A root wrapper: Lexical editor-state is `{ root: { children, type:"root", ... } }`. */
function root(...children: unknown[]): unknown {
  return { root: { type: "root", direction: "ltr", format: "", indent: 0, version: 1, children } };
}
function text(t: string, format = 0): unknown {
  return { type: "text", text: t, format, detail: 0, mode: "normal", style: "", version: 1 };
}
function p(...children: unknown[]): unknown {
  return { type: "paragraph", direction: null, format: "", indent: 0, version: 1, children };
}

/** Stub resolvers. `resolveAttachment` returns a ref per fileUuid/dataUrl; the
 *  `mime` controls which node the converter emits (image/audio/video/other). */
function stubResolvers(opts: {
  attachmentMime?: (key: string) => string;
  attachmentCalls?: string[];
  tagCalls?: string[];
} = {}): Resolvers {
  const mimeFor = opts.attachmentMime ?? (() => "image/png");
  return {
    async resolveAttachment(input): Promise<AttachmentRef | null> {
      const key = input.kind === "snfile" ? input.fileUuid : input.dataUrl;
      opts.attachmentCalls?.push(key);
      return { hash: `H-${key.slice(0, 8)}`, filename: "f", mime: mimeFor(key), size: 100 };
    },
    async resolveTag(title): Promise<TagRef | null> {
      opts.tagCalls?.push(title);
      return { id: `tag-${title}`, title };
    }
  };
}

describe("lexicalToTipTapHtml — text marks", () => {
  it("empty root → empty html, null title", async () => {
    const r = await lexicalToTipTapHtml(root(), stubResolvers());
    expect(r.html).toBe("");
    expect(r.title).toBeNull();
    expect(r.tagIds).toEqual([]);
  });

  it("plain paragraph", async () => {
    const r = await lexicalToTipTapHtml(root(p(text("hello"))), stubResolvers());
    expect(r.html).toBe("<p>hello</p>");
  });

  it("bold+italic+code marks nest in fixed order", async () => {
    // format: bold(1)|italic(2)|code(16) = 19
    const r = await lexicalToTipTapHtml(root(p(text("x", 1 | 2 | 16))), stubResolvers());
    expect(r.html).toBe("<p><strong><em><code>x</code></em></strong></p>");
  });

  it("underline and highlight", async () => {
    // underline(8) + highlight(128) = 136
    const r = await lexicalToTipTapHtml(root(p(text("x", 8 | 128))), stubResolvers());
    expect(r.html).toBe("<p><u><mark>x</mark></u></p>");
  });

  it("strikethrough", async () => {
    const r = await lexicalToTipTapHtml(root(p(text("x", 4))), stubResolvers());
    expect(r.html).toBe("<p><s>x</s></p>");
  });

  it("escapes HTML-significant characters in text", async () => {
    const r = await lexicalToTipTapHtml(root(p(text('<script>alert("x")</script>'))), stubResolvers());
    expect(r.html).toBe("<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>");
  });

  it("hard break (linebreak) → <br>", async () => {
    const r = await lexicalToTipTapHtml(root(p(text("a"), { type: "linebreak", version: 1 }, text("b"))), stubResolvers());
    expect(r.html).toBe("<p>a<br>b</p>");
  });
});

describe("lexicalToTipTapHtml — blocks", () => {
  it("heading h2 with text-align right", async () => {
    const node = { type: "heading", tag: "h2", direction: "ltr", format: "right", indent: 0, version: 1, children: [text("Title")] };
    const r = await lexicalToTipTapHtml(root(node), stubResolvers());
    expect(r.html).toBe('<h2 style="text-align: right">Title</h2>');
  });

  it("heading without explicit title → title is the first heading text", async () => {
    const node = { type: "heading", tag: "h1", direction: "ltr", format: "", indent: 0, version: 1, children: [text("My Heading")] };
    const r = await lexicalToTipTapHtml(root(node), stubResolvers());
    expect(r.title).toBe("My Heading");
  });

  it("blockquote", async () => {
    const q = { type: "quote", direction: null, format: "", indent: 0, version: 1, children: [p(text("quoted"))] };
    const r = await lexicalToTipTapHtml(root(q), stubResolvers());
    expect(r.html).toBe("<blockquote><p>quoted</p></blockquote>");
  });

  it("horizontal rule", async () => {
    const r = await lexicalToTipTapHtml(root({ type: "horizontalrule", version: 1 } as unknown), stubResolvers());
    expect(r.html).toBe("<hr>");
  });

  it("bullet list with nested bullet list", async () => {
    const inner = { type: "list", listType: "bullet", tag: "ul", start: 1, direction: null, format: "", indent: 0, version: 1, children: [{ type: "listitem", value: 1, checked: null, direction: "ltr", format: "", indent: 0, version: 1, children: [text("inner")] }] };
    const outer = { type: "list", listType: "bullet", tag: "ul", start: 1, direction: null, format: "", indent: 0, version: 1, children: [{ type: "listitem", value: 1, checked: null, direction: "ltr", format: "", indent: 0, version: 1, children: [text("outer"), inner] }] };
    const r = await lexicalToTipTapHtml(root(outer), stubResolvers());
    expect(r.html).toBe("<ul><li>outer<ul><li>inner</li></ul></li></ul>");
  });

  it("numbered list — no start attribute (lost)", async () => {
    const ol = { type: "list", listType: "number", tag: "ol", start: 5, direction: null, format: "", indent: 0, version: 1, children: [{ type: "listitem", value: 5, checked: null, direction: "ltr", format: "", indent: 0, version: 1, children: [text("one")] }] };
    const r = await lexicalToTipTapHtml(root(ol), stubResolvers());
    expect(r.html).toBe("<ol><li>one</li></ol>");
    expect(r.html).not.toContain("start");
  });

  it("check list with checked + unchecked items", async () => {
    const cl = { type: "list", listType: "check", tag: "ul", start: 1, direction: null, format: "", indent: 0, version: 1, children: [
      { type: "listitem", value: 1, checked: true, direction: "ltr", format: "", indent: 0, version: 1, children: [text("done")] },
      { type: "listitem", value: 2, checked: false, direction: "ltr", format: "", indent: 0, version: 1, children: [text("todo")] }
    ] };
    const r = await lexicalToTipTapHtml(root(cl), stubResolvers());
    // Imported check lists emit the SIMPLE checklist (mobile's checkbox list),
    // not the rich task-list — no progress header, CSS-drawn checkbox.
    expect(r.html).toBe('<ul class="simple-checklist"><li class="simple-checklist--item checked">done</li><li class="simple-checklist--item">todo</li></ul>');
  });

  it("nested check list (check > check) nests as a child <ul class=\"simple-checklist\"> (no flattening)", async () => {
    // The simple checklist has no per-list header, so a check item containing a
    // nested check list nests it as a real child `<ul class="simple-checklist">`
    // inside the parent `<li>` — faithful to the source (the rich task-list
    // flattened to `data-indent` siblings to avoid stacking progress headers).
    const inner = { type: "list", listType: "check", tag: "ul", start: 1, direction: null, format: "", indent: 0, version: 1, children: [
      { type: "listitem", value: 1, checked: false, direction: "ltr", format: "", indent: 0, version: 1, children: [text("child")] }
    ] };
    const outer = { type: "list", listType: "check", tag: "ul", start: 1, direction: null, format: "", indent: 0, version: 1, children: [
      { type: "listitem", value: 1, checked: true, direction: "ltr", format: "", indent: 0, version: 1, children: [text("parent"), inner] }
    ] };
    const r = await lexicalToTipTapHtml(root(outer), stubResolvers());
    expect((r.html.match(/<ul class="simple-checklist"/g) || []).length).toBe(2);
    expect(r.html).toBe(
      '<ul class="simple-checklist"><li class="simple-checklist--item checked">parent<ul class="simple-checklist"><li class="simple-checklist--item">child</li></ul></li></ul>'
    );
    expect(r.html).not.toContain("data-indent");
  });

  it("empty check item wrapping a nested check list keeps the parent (nesting preserved, no drop)", async () => {
    const inner = { type: "list", listType: "check", tag: "ul", start: 1, direction: null, format: "", indent: 0, version: 1, children: [
      { type: "listitem", value: 1, checked: false, direction: "ltr", format: "", indent: 0, version: 1, children: [text("check item X")] }
    ] };
    const outer = { type: "list", listType: "check", tag: "ul", start: 1, direction: null, format: "", indent: 0, version: 1, children: [
      { type: "listitem", value: 1, checked: false, direction: "ltr", format: "", indent: 0, version: 1, children: [inner] }
    ] };
    const r = await lexicalToTipTapHtml(root(outer), stubResolvers());
    // The empty wrapper item is kept (it nests the child list) — no flattening.
    expect((r.html.match(/<ul class="simple-checklist"/g) || []).length).toBe(2);
    expect(r.html).toBe(
      '<ul class="simple-checklist"><li class="simple-checklist--item"><ul class="simple-checklist"><li class="simple-checklist--item">check item X</li></ul></li></ul>'
    );
  });

  it("bullet > check > check: nested check lists nest as child <ul>s (no data-indent)", async () => {
    const inner = { type: "list", listType: "check", tag: "ul", start: 1, direction: null, format: "", indent: 0, version: 1, children: [
      { type: "listitem", value: 1, checked: false, direction: "ltr", format: "", indent: 0, version: 1, children: [text("check item X")] }
    ] };
    const middle = { type: "list", listType: "check", tag: "ul", start: 1, direction: null, format: "", indent: 0, version: 1, children: [
      { type: "listitem", value: 1, checked: false, direction: "ltr", format: "", indent: 0, version: 1, children: [inner] }
    ] };
    const bullet = { type: "list", listType: "bullet", tag: "ul", start: 1, direction: null, format: "", indent: 0, version: 1, children: [
      { type: "listitem", value: 1, checked: null, direction: "ltr", format: "", indent: 0, version: 1, children: [text("list item"), middle] }
    ] };
    const r = await lexicalToTipTapHtml(root(bullet), stubResolvers());
    expect((r.html.match(/<ul class="simple-checklist"/g) || []).length).toBe(2);
    expect(r.html).not.toContain("data-indent");
    expect(r.html).toContain("check item X");
    expect(r.html).toContain("list item");
  });

  it("code block with language — child code-highlight text concatenated", async () => {
    const code = { type: "code", language: "typescript", direction: null, format: "", indent: 0, version: 1, children: [
      { type: "code-highlight", text: "const x", format: 0, highlightType: "keyword" },
      { type: "text", text: " = 1;\n", format: 0, mode: "normal", detail: 0, style: "", version: 1 }
    ] } as unknown;
    const r = await lexicalToTipTapHtml(root(code), stubResolvers());
    expect(r.html).toBe('<pre class="language-typescript" data-indent-type="space" data-indent-length="2"><code>const x = 1;\n</code></pre>');
  });

  it("link carries href/target/rel/title", async () => {
    const link = { type: "link", url: "https://example.com", target: "_blank", rel: "noopener", title: "ex", direction: null, format: "", indent: 0, version: 1, children: [text("link text")] };
    const r = await lexicalToTipTapHtml(root(p(link)), stubResolvers());
    expect(r.html).toBe('<p><a href="https://example.com" target="_blank" rel="noopener" title="ex">link text</a></p>');
  });
});

describe("lexicalToTipTapHtml — tables", () => {
  function cell(headerState: number, children: unknown[]): unknown {
    return { type: "tablecell", headerState, colSpan: 1, rowSpan: 1, backgroundColor: null, direction: null, format: "", indent: 0, version: 1, children };
  }
  function row(...cells: unknown[]): unknown {
    return { type: "tablerow", direction: null, format: "", indent: 0, version: 1, children: cells };
  }

  it("header row + body row, colspan + background color", async () => {
    const table = { type: "table", direction: null, format: "", indent: 0, version: 1, children: [
      row(cell(3, [p(text("H"))])),
      row({ type: "tablecell", headerState: 0, colSpan: 2, rowSpan: 1, backgroundColor: "#ffeeee", direction: null, format: "", indent: 0, version: 1, children: [p(text("body"))] })
    ] };
    const r = await lexicalToTipTapHtml(root(table), stubResolvers());
    expect(r.html).toBe(
      '<table><tbody><tr><th><p>H</p></th></tr><tr><td colspan="2" style="background-color: #ffeeee"><p>body</p></td></tr></tbody></table>'
    );
  });

  it("multi-paragraph cell content is preserved (the lossless win)", async () => {
    const table = { type: "table", direction: null, format: "", indent: 0, version: 1, children: [
      row(cell(0, [p(text("first")), p(text("second")), p(text(""))]))
    ] };
    const r = await lexicalToTipTapHtml(root(table), stubResolvers());
    expect(r.html).toContain("<td><p>first</p><p>second</p><p></p></td>");
  });
});

describe("lexicalToTipTapHtml — media + embeds", () => {
  it("snfile image → <img data-hash>", async () => {
    const r = await lexicalToTipTapHtml(root({ type: "snfile", fileUuid: "uuid-1", zoomLevel: 100, format: "", version: 1 } as unknown), stubResolvers());
    expect(r.html).toContain("<img");
    expect(r.html).toContain('data-hash="H-uuid-1"');
    expect(r.html).toContain('data-mime="image/png"');
    expect(r.stats.attachments).toBe(1);
  });

  it("snfile audio → <audio data-hash controls>", async () => {
    const r = await lexicalToTipTapHtml(root({ type: "snfile", fileUuid: "aud-1", zoomLevel: 100, format: "", version: 1 } as unknown), stubResolvers({ attachmentMime: () => "audio/mpeg" }));
    expect(r.html).toContain("<audio");
    expect(r.html).toContain("controls");
    expect(r.html).toContain('data-mime="audio/mpeg"');
  });

  it("snfile video → <video data-hash controls>", async () => {
    const r = await lexicalToTipTapHtml(root({ type: "snfile", fileUuid: "vid-1", zoomLevel: 100, format: "", version: 1 } as unknown), stubResolvers({ attachmentMime: () => "video/mp4" }));
    expect(r.html).toContain("<video");
    expect(r.html).toContain("controls");
  });

  it("snfile other binary → attachment chip span[data-hash]", async () => {
    const r = await lexicalToTipTapHtml(root({ type: "snfile", fileUuid: "doc-1", zoomLevel: 100, format: "", version: 1 } as unknown), stubResolvers({ attachmentMime: () => "application/pdf" }));
    expect(r.html).toContain("<span");
    expect(r.html).toContain('data-hash="H-doc-1"');
    expect(r.html).not.toContain("<img");
  });

  it("unencrypted-image → <img src> (alt lost)", async () => {
    const r = await lexicalToTipTapHtml(root({ type: "unencrypted-image", src: "https://x/y.jpg", alt: "desc", format: "", version: 1 } as unknown), stubResolvers());
    expect(r.html).toContain('<img src="https://x/y.jpg"');
    expect(r.html).not.toContain("alt");
  });

  it("youtube → youtube-nocookie embed iframe", async () => {
    const r = await lexicalToTipTapHtml(root({ type: "youtube", videoID: "abc123", format: "", version: 1 } as unknown), stubResolvers());
    expect(r.html).toContain('src="https://www.youtube-nocookie.com/embed/abc123"');
    expect(r.html).toContain("<iframe");
  });

  it("tweet → x.com link", async () => {
    const r = await lexicalToTipTapHtml(root({ type: "tweet", id: "123", format: "", version: 1 } as unknown), stubResolvers());
    expect(r.html).toContain('href="https://x.com/i/web/status/123"');
  });

  it("snbubble → nn:// note link", async () => {
    const r = await lexicalToTipTapHtml(root({ type: "snbubble", itemUuid: "note-uuid-1", version: 1 } as unknown), stubResolvers());
    expect(r.html).toContain('href="nn://note/note-uuid-1"');
  });
});

describe("lexicalToTipTapHtml — hashtags + de-dup", () => {
  it("hashtag → tag-mention chip + tagIds", async () => {
    const r = await lexicalToTipTapHtml(root(p({ type: "hashtag", text: "#Shop", format: 0, detail: 0, mode: "normal", style: "", version: 1 } as unknown)), stubResolvers());
    expect(r.html).toContain('data-tag-id="tag-Shop"');
    expect(r.html).toContain('data-tag-title="Shop"');
    expect(r.tagIds).toEqual(["tag-Shop"]);
  });

  it("de-dup: two identical hashtags resolve once", async () => {
    const calls: string[] = [];
    const ht = { type: "hashtag", text: "#foo", format: 0, detail: 0, mode: "normal", style: "", version: 1 } as unknown;
    const r = await lexicalToTipTapHtml(root(p(ht, text(" "), ht)), stubResolvers({ tagCalls: calls }));
    expect(calls).toEqual(["foo"]); // resolver called once (converter-side dedup via cache would be in host; here stub records every call)
    // The converter emits two chips but collects one tagId.
    expect((r.html.match(/data-tag-id/g) || []).length).toBe(2);
    expect(r.tagIds).toEqual(["tag-foo"]);
  });

  it("mark node → <mark> (ids lost)", async () => {
    const mk = { type: "mark", ids: ["x"], direction: null, format: "", indent: 0, version: 1, children: [text("hl")] } as unknown;
    const r = await lexicalToTipTapHtml(root(p(mk)), stubResolvers());
    expect(r.html).toBe("<p><mark>hl</mark></p>");
  });

  it("overflow node unwraps to plain text", async () => {
    const ov = { type: "overflow", direction: null, format: "", indent: 0, version: 1, children: [text("longurl")] } as unknown;
    const r = await lexicalToTipTapHtml(root(p(ov)), stubResolvers());
    expect(r.html).toBe("<p>longurl</p>");
  });
});

describe("lexicalToTipTapHtml — title + failure accounting", () => {
  it("explicit title overrides first heading", async () => {
    const node = { type: "heading", tag: "h1", direction: "ltr", format: "", indent: 0, version: 1, children: [text("Heading")] };
    const r = await lexicalToTipTapHtml(root(node), stubResolvers(), "Explicit");
    expect(r.title).toBe("Explicit");
  });

  it("attachment resolution failure recorded in stats.failed", async () => {
    const r = await lexicalToTipTapHtml(root({ type: "snfile", fileUuid: "missing", zoomLevel: 100, format: "", version: 1 } as unknown), {
      ...stubResolvers(),
      resolveAttachment: async () => null
    });
    expect(r.stats.failed.length).toBeGreaterThan(0);
    expect(r.html).toBe(""); // no node emitted for a failed attachment
  });
});

describe("lexicalToTipTapHtml — accepts the SN note object", () => {
  it("parses note.text JSON string", async () => {
    const editorState = root(p(text("hi")));
    const note = { preview_title: "T", text: JSON.stringify(editorState) };
    const r = await lexicalToTipTapHtml(note, stubResolvers(), "T");
    expect(r.html).toBe("<p>hi</p>");
    expect(r.title).toBe("T");
  });
});