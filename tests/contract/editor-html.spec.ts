// @vitest-environment happy-dom
/**
 * Round-trip contract test for the ported editor node-views.
 *
 * Proves that HTML stored by @notesnook/editor parses into the Vue-ported
 * schema and re-serialises with the same data-* attributes / classes — so old
 * notes don't lose data and saves stay diff-stable. This is the real contract:
 * the Vue node-views are editing-only UI; the round-trip is governed by each
 * node's `parseHTML`/`renderHTML`, copied verbatim from upstream.
 *
 * Runs under happy-dom (per-file env override; the other contract tests stay
 * in `node`). Builds the schema via a throwaway `Editor` with empty content
 * (so StarterKit is flattened by `ExtensionManager` and no custom node-view
 * mounts), then parses/serialises the test HTML through `editor.schema` with
 * ProseMirror `DOMParser`/`DOMSerializer` — no Editor involvement in parsing
 * the test HTML, so no Vue rendering in the test.
 */
import { describe, it, expect, afterAll } from "vitest";
import { DOMParser, DOMSerializer } from "@tiptap/pm/model";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  AttachmentNode,
  TaskItemNode,
  TaskListNode,
  EmbedNode,
  ImageNode,
  CodeBlock,
  Table,
  TableRow,
  TableCell,
  TableHeader,
  Underline,
  Highlight,
  TagMention
} from "@notesnook-vue/editor-vue";

const editor = new Editor({
  element: document.createElement("div"),
  extensions: [
    StarterKit.configure({ codeBlock: false }),
    AttachmentNode,
    TaskListNode,
    TaskItemNode.configure({ nested: true }),
    EmbedNode,
    ImageNode,
    CodeBlock,
    // Table (2.4h) — mirrors Editor.vue. The columnResizing/tableEditing
    // plugins are installed but inert here (no transactions during parse/
    // serialize); the round-trip is governed purely by the node schema.
    Table.configure({ resizable: true, showResizeHandleOnSelection: true }),
    TableRow,
    TableCell,
    TableHeader,
    // Inline marks (Phase 5.3) — pure toggles, mirror Editor.vue. Underline
    // round-trips as <u>, Highlight as <mark>.
    Underline,
    Highlight,
    // Tag-mention (Phase 5.4) — inline `#tag` chip node. `TagSuggest` is a
    // Suggestion plugin (no schema of its own) and is omitted here; only the
    // node's parseHTML/renderHTML govern the round-trip.
    TagMention
  ],
  content: ""
});
const schema = editor.schema;

afterAll(() => editor.destroy());

/** Parse `html` through the schema and re-serialise it back to HTML. */
function roundTrip(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  const doc = DOMParser.fromSchema(schema).parse(container);
  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(doc.content);
  const out = document.createElement("div");
  out.appendChild(fragment);
  return out.innerHTML;
}

describe("editor node-view round-trip (2.4a + 2.4b + 2.4c + 2.4h)", () => {
  it("underline mark round-trips as <u>", () => {
    // Phase 5.3 — pure-toggle re-export of @tiptap/extension-underline.
    const out = roundTrip("<p><u>underlined</u> plain</p>");
    expect(out).toContain("<u>underlined</u>");
    expect(out).toContain("plain");
  });

  it("highlight mark round-trips as <mark>", () => {
    // Phase 5.3 — plain @tiptap/extension-highlight (no colour arg) renders a
    // bare <mark>; the data-colour attribute is absent on the default toggle.
    const out = roundTrip("<p><mark>highlighted</mark> plain</p>");
    expect(out).toContain("<mark>highlighted</mark>");
    expect(out).toContain("plain");
  });

  it("attachment chip preserves data-hash/filename/mime/size", () => {
    const html =
      '<p>see <span data-hash="abc" data-filename="readme.md" data-mime="text/markdown" data-size="2048"></span></p>';
    const out = roundTrip(html);
    expect(out).toContain('data-hash="abc"');
    expect(out).toContain('data-filename="readme.md"');
    expect(out).toContain('data-mime="text/markdown"');
    expect(out).toContain('data-size="2048"');
    expect(out).toContain("<span ");
  });

  it("task list + task items preserve class-based checked state + data-title", () => {
    const html =
      '<ul class="checklist" data-title="Demo"><li class="checklist--item checked"><p>done</p></li><li class="checklist--item"><p>todo</p></li></ul>';
    const out = roundTrip(html);
    expect(out).toContain('class="checklist"');
    expect(out).toContain('data-title="Demo"');
    expect([...out.matchAll(/checklist--item/g)].length).toBe(2);
    // the first item keeps its `checked` class (merge order: checked first)
    expect(out).toContain('<li class="checked checklist--item"><p>done</p></li>');
    expect(out).toContain('<li class="checklist--item"><p>todo</p></li>');
  });

  it("a plain (non-checklist) unordered list still round-trips as a bullet list", () => {
    const html = "<ul><li>a</li><li>b</li></ul>";
    const out = roundTrip(html);
    expect(out).not.toContain('class="checklist"');
    expect(out).toContain("<ul>");
    // bullet-list items wrap their text in a paragraph
    expect(out).toContain("<li><p>a</p></li>");
    expect(out).toContain("<li><p>b</p></li>");
  });

  it("nested task list parses and preserves the root + nested structure", () => {
    const html =
      '<ul class="checklist" data-title="root"><li class="checklist--item checked"><p>has sub</p><ul class="checklist"><li class="checklist--item"><p>sub</p></li></ul></li></ul>';
    const out = roundTrip(html);
    expect(out).toContain('data-title="root"');
    // two checklist <ul>s (root + nested); count the class attr so attribute
    // ordering (data-title may precede class) doesn't matter.
    expect((out.match(/class="checklist"/g) || []).length).toBe(2);
    expect((out.match(/checklist--item/g) || []).length).toBe(2);
  });

  it("task item data-indent round-trips and is omitted at indent 0", () => {
    // indented item keeps its data-indent; the un-indented sibling emits none.
    const html =
      '<ul class="checklist"><li class="checklist--item" data-indent="2"><p>indented</p></li><li class="checklist--item"><p>flat</p></li></ul>';
    const out = roundTrip(html);
    expect(out).toContain('data-indent="2"');
    // the flat item must NOT carry a data-indent attribute
    expect(out).toContain('<li class="checklist--item"><p>flat</p></li>');
  });

  it("task item data-indent is clamped to the max on parse", () => {
    const html =
      '<ul class="checklist"><li class="checklist--item" data-indent="99"><p>way too deep</p></li></ul>';
    const out = roundTrip(html);
    expect(out).toContain('data-indent="8"');
  });

  it("a note with an attachment + checklist round-trips together (seed-shape)", () => {
    const html =
      '<p>Intro</p><ul class="checklist" data-title="2.4a progress"><li class="checklist--item checked"><p>Attachment chip</p></li><li class="checklist--item"><p>Task list</p></li></ul><p>Sample: <span data-hash="demo-001" data-filename="phase-2.4.md" data-mime="text/markdown" data-size="2048"></span></p>';
    const out = roundTrip(html);
    expect(out).toContain('data-hash="demo-001"');
    expect(out).toContain('data-title="2.4a progress"');
    expect((out.match(/checklist--item/g) || []).length).toBe(2);
  });

  it("embed iframe preserves src (round-trip)", () => {
    const html = '<p>video:</p><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>';
    const out = roundTrip(html);
    expect(out).toContain('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
    expect(out).toContain("</iframe>");
    // exactly one iframe
    expect((out.match(/<iframe /g) || []).length).toBe(1);
  });

  it("embed iframe preserves width/height/align attrs", () => {
    const html =
      '<iframe src="https://example.com/embed" width="480" height="270" align="center"></iframe>';
    const out = roundTrip(html);
    expect(out).toContain('src="https://example.com/embed"');
    expect(out).toContain('width="480"');
    expect(out).toContain('height="270"');
    expect(out).toContain('align="center"');
  });

  it("embed without width/height/align round-trips bare (no phantom attrs)", () => {
    const html = '<iframe src="https://example.com/bare"></iframe>';
    const out = roundTrip(html);
    expect(out).not.toContain("width=");
    expect(out).not.toContain("height=");
    expect(out).not.toContain("align=");
    expect(out).toContain('src="https://example.com/bare"');
  });

  it("embed + checklist + attachment round-trip together (2.4b seed-shape)", () => {
    const html =
      '<p>Demo</p><ul class="checklist" data-title="2.4b progress"><li class="checklist--item checked"><p>Embed node</p></li><li class="checklist--item"><p>Resizer</p></li></ul><iframe src="https://example.com/embed" width="480" height="270"></iframe><p><span data-hash="h1" data-filename="a.md" data-mime="text/markdown" data-size="10"></span></p>';
    const out = roundTrip(html);
    expect(out).toContain('src="https://example.com/embed"');
    expect(out).toContain('width="480"');
    expect(out).toContain('data-title="2.4b progress"');
    expect(out).toContain('data-hash="h1"');
  });

  it("code block preserves language class + code wrapper", () => {
    const html = '<pre class="language-javascript"><code>const x = 1;</code></pre>';
    const out = roundTrip(html);
    expect(out).toContain('class="language-javascript"');
    expect(out).toContain("<code>");
    expect(out).toContain("const x = 1;");
    // exactly one pre (StarterKit codeBlock disabled — our codeblock owns <pre>)
    expect((out.match(/<pre /g) || []).length).toBe(1);
  });

  it("code block preserves data-indent-type / data-indent-length", () => {
    const html =
      '<pre class="language-python" data-indent-type="space" data-indent-length="4"><code>print("hi")</code></pre>';
    const out = roundTrip(html);
    expect(out).toContain('class="language-python"');
    expect(out).toContain('data-indent-type="space"');
    expect(out).toContain('data-indent-length="4"');
    expect(out).toContain('print("hi")');
  });

  it("code block without a language round-trips with default indent attrs (no language class)", () => {
    // indentType/indentLength defaults ("space"/2) are truthy so they render —
    // a real stored codeblock always carries data-indent-type/data-indent-length.
    // A bare imported <pre><code> gains those defaults on first round-trip and
    // is then idempotent.
    const html = "<pre><code>plain code</code></pre>";
    const out = roundTrip(html);
    expect(out).toContain("<code>plain code</code></pre>");
    expect(out).toContain('data-indent-type="space"');
    expect(out).toContain('data-indent-length="2"');
    expect(out).not.toContain("language-");
    // id is rendered:false — must not leak into stored HTML
    expect(out).not.toContain("codeblock-");
    // second pass is idempotent
    const out2 = roundTrip(out);
    expect(out2).toBe(out);
  });

  it("code block language parses from <code> child class too (upstream shape)", () => {
    // some stored HTML carries the language class on the inner <code>, not <pre>
    const html = '<pre><code class="language-ts">type X = 1;</code></pre>';
    const out = roundTrip(html);
    expect(out).toContain('class="language-ts"');
    expect(out).toContain("type X = 1;");
  });

  // --- 2.4h: table node-view round-trip -------------------------------------
  // Table renderHTML emits <table style="width|min-width"><colgroup><col>…
  // </colgroup><tbody>…</tbody></table>; cells render td/th with colspan/
  // rowspan always present (defaults 1) — byte-stable upstream behaviour.

  it("table with a header row round-trips (th + td + colgroup + min-width style)", () => {
    const html =
      "<table><tbody><tr><th>Feature</th><th>Status</th></tr><tr><td>Cell editing</td><td>works</td></tr></tbody></table>";
    const out = roundTrip(html);
    expect(out).toContain("<table");
    expect(out).toContain("<colgroup>");
    // 2 columns × cellMinWidth(25) → min-width: 50px (no explicit colwidths).
    // (happy-dom serialises the style with a trailing `;`, so match the substring.)
    expect(out).toContain("min-width: 50px");
    expect(out).toContain("<tbody>");
    expect(out).toContain("<th");
    expect(out).toContain("<td");
    expect(out).toContain("Cell editing");
    // colspan/rowspan defaults render on every cell
    expect((out.match(/colspan="1"/g) || []).length).toBe(4);
    expect((out.match(/rowspan="1"/g) || []).length).toBe(4);
  });

  it("table preserves colspan/rowspan", () => {
    const html =
      '<table><tbody><tr><td colspan="2">merged</td></tr><tr><td>a</td><td>b</td></tr></tbody></table>';
    const out = roundTrip(html);
    expect(out).toContain('colspan="2"');
    expect(out).toContain(">merged<");
    // the merged cell still carries rowspan default
    expect(out).toContain('colspan="2" rowspan="1"');
  });

  it("table preserves data-colwidth (column widths) + emits width style + col widths", () => {
    const html =
      '<table><tbody><tr><td data-colwidth="480">a</td><td data-colwidth="120">b</td></tr></tbody></table>';
    const out = roundTrip(html);
    expect(out).toContain('data-colwidth="480"');
    expect(out).toContain('data-colwidth="120"');
    // all cols have explicit widths → fixedWidth → width style (480+120=600)
    expect(out).toContain("width: 600px");
    expect(out).toContain("width: 480px");
    expect(out).toContain("width: 120px");
  });

  it("table migrates the legacy colwidth attr to data-colwidth", () => {
    const html =
      '<table><tbody><tr><td colwidth="100">x</td></tr></tbody></table>';
    const out = roundTrip(html);
    // exactly one `colwidth="100"` substring — the migrated data-colwidth one
    expect((out.match(/colwidth="100"/g) || []).length).toBe(1);
    expect(out).toContain('data-colwidth="100"');
  });

  it("table cell border-width + border-style round-trip (stable values)", () => {
    const html =
      '<table><tbody><tr><td style="border-width: 2px; border-style: solid">x</td></tr></tbody></table>';
    const out = roundTrip(html);
    expect(out).toContain("border-width: 2px");
    expect(out).toContain("border-style: solid");
  });

  it("table cell background-color round-trips and is idempotent", () => {
    // browsers may normalise the colour value; assert presence + idempotency
    // rather than an exact value.
    const html =
      '<table><tbody><tr><td style="background-color: red">x</td></tr></tbody></table>';
    const out = roundTrip(html);
    expect(out).toContain("background-color:");
    expect(roundTrip(out)).toBe(out);
  });

  it("bare table seeds min-width style + colspan/rowspan defaults and is idempotent", () => {
    const html = "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>";
    const out = roundTrip(html);
    expect(out).toContain("min-width: 50px");
    expect(out).toContain('colspan="1"');
    // second pass is stable (defaults already seeded)
    expect(roundTrip(out)).toBe(out);
  });

  it("table + checklist + embed + codeblock round-trip together (2.4h seed-shape)", () => {
    const html =
      '<p>Demo</p><table><tbody><tr><th>Feature</th><th>Status</th></tr><tr><td>Tables</td><td>works</td></tr></tbody></table><ul class="checklist" data-title="2.4h progress"><li class="checklist--item checked"><p>Row/col toolbars</p></li></ul><iframe src="https://example.com/embed" width="480" height="270"></iframe><pre class="language-typescript"><code>const x: number = 1;</code></pre>';
    const out = roundTrip(html);
    expect(out).toContain("<table");
    expect(out).toContain("<colgroup>");
    expect(out).toContain('data-title="2.4h progress"');
    expect(out).toContain('src="https://example.com/embed"');
    expect(out).toContain('class="language-typescript"');
    expect(out).toContain("Row/col toolbars");
  });

  // --- 2.4e: image node-view round-trip ---------------------------------------
  // Image renderHTML emits `<img src width height data-align data-hash
  // data-filename data-mime data-size data-aspect-ratio>`. `align` uses
  // `getDataAttribute` (→ `data-align`), unlike the embed port's plain `align`.
  // A bare `<img>` gains `data-aspect-ratio="1"` on first round-trip (the
  // aspectRatio `parseHTML` falls back to 1, and 1 is truthy → renders) and is
  // then idempotent — upstream-faithful behaviour.

  it("image preserves src/width/height + data-align + data-aspect-ratio", () => {
    const html =
      '<img src="https://example.com/cat.png" width="480" height="320" data-align="center" data-aspect-ratio="1.5">';
    const out = roundTrip(html);
    expect(out).toContain('src="https://example.com/cat.png"');
    expect(out).toContain('width="480"');
    expect(out).toContain('height="320"');
    expect(out).toContain('data-align="center"');
    expect(out).toContain('data-aspect-ratio="1.5"');
    expect((out.match(/<img /g) || []).length).toBe(1);
  });

  it("image preserves attachment data-hash/filename/mime/size", () => {
    const html =
      '<img src="data:image/png;base64,iVBORw0KGgo=" data-hash="img-001" data-filename="cat.png" data-mime="image/png" data-size="1024" width="240" height="120">';
    const out = roundTrip(html);
    expect(out).toContain('data-hash="img-001"');
    expect(out).toContain('data-filename="cat.png"');
    expect(out).toContain('data-mime="image/png"');
    expect(out).toContain('data-size="1024"');
    expect(out).toContain('src="data:image/png;base64,iVBORw0KGgo="');
  });

  it("bare image gains data-aspect-ratio default and is idempotent (upstream shape)", () => {
    const html = '<img src="https://example.com/bare.png">';
    const out = roundTrip(html);
    expect(out).toContain('src="https://example.com/bare.png"');
    // aspectRatio parseHTML falls back to 1 → rendered (truthy)
    expect(out).toContain('data-aspect-ratio="1"');
    // no width/height/align when unset
    expect(out).not.toContain("width=");
    expect(out).not.toContain("height=");
    expect(out).not.toContain("data-align");
    // second pass is stable
    expect(roundTrip(out)).toBe(out);
  });

  it("image migrates a <p>-wrapped inline image into a block image (skip rule)", () => {
    // upstream migration: a <p> containing an <img> is skipped so the image
    // parses as a block node, not as paragraph content.
    const html = '<p><img src="https://example.com/in-p.png"></p>';
    const out = roundTrip(html);
    expect(out).toContain("<img");
    // the wrapping <p> is dropped — the image is a top-level block
    expect(out).not.toContain("<p>");
    expect((out.match(/<img /g) || []).length).toBe(1);
  });

  it("a <p> without an image still parses as a normal paragraph (skip rule guard)", () => {
    const html = "<p>just text</p>";
    const out = roundTrip(html);
    expect(out).toContain("<p>just text</p>");
    expect(out).not.toContain("<img");
  });

  it("image + checklist + embed round-trip together (2.4e seed-shape)", () => {
    const html =
      '<p>Demo</p><img src="https://example.com/pic.png" width="240" height="120" data-align="center"><ul class="checklist" data-title="2.4e progress"><li class="checklist--item checked"><p>Lazy blob load</p></li></ul><iframe src="https://example.com/embed" width="480" height="270"></iframe>';
    const out = roundTrip(html);
    expect(out).toContain('src="https://example.com/pic.png"');
    expect(out).toContain('data-align="center"');
    expect(out).toContain('data-title="2.4e progress"');
    expect(out).toContain('src="https://example.com/embed"');
  });

  // --- Phase 5.4: tag-mention chip round-trip --------------------------------
  // The chip serialises as `<span data-tag-id data-tag-title>` (explicit dash-form
  // attribute specs — NOT `getDataAttribute`, whose camelCase `data-tagId` would
  // be lower-cased to `data-tagid` by the DOM and break the round-trip).

  it("tag-mention chip preserves data-tag-id + data-tag-title", () => {
    const html = '<p>tag <span data-tag-id="t1" data-tag-title="work"></span> after</p>';
    const out = roundTrip(html);
    expect(out).toContain('data-tag-id="t1"');
    expect(out).toContain('data-tag-title="work"');
    expect((out.match(/<span /g) || []).length).toBe(1);
  });

  it("tag-mention chip round-trips and is idempotent", () => {
    const html = '<p>see <span data-tag-id="t2" data-tag-title="weekend"></span></p>';
    const out = roundTrip(html);
    expect(out).toContain('data-tag-id="t2"');
    expect(out).toContain('data-tag-title="weekend"');
    expect(roundTrip(out)).toBe(out);
  });

  it("tag-mention chip with no title round-trips bare", () => {
    const html = '<p><span data-tag-id="t3"></span></p>';
    const out = roundTrip(html);
    expect(out).toContain('data-tag-id="t3"');
    expect(out).not.toContain("data-tag-title");
  });

  // Regression: inserting a chip + trailing space as a mixed content array
  // must use an explicit text node for the space. `insertContentAt(pos,
  // [{node}, " "])` with a bare string throws inside `createNodeFromContent`
  // (it routes the string through `Node.fromJSON`) and silently no-ops, so
  // the chip never appears. The explicit `{type:"text", text:" "}` form
  // inserts both the chip and the space.
  it("chip + trailing space insert as a mixed array (explicit text node)", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "hello" },
            { type: "tagMention", attrs: { tagId: "t1", title: "work" } },
            { type: "text", text: " " },
            { type: "text", text: "world" }
          ]
        }
      ]
    });
    const fragment = DOMSerializer.fromSchema(schema).serializeFragment(doc.content);
    const out = document.createElement("div");
    out.appendChild(fragment);
    const html = out.innerHTML;
    expect(html).toContain('data-tag-id="t1"');
    expect(html).toContain('data-tag-title="work"');
    expect(html).toContain("world");
  });
});