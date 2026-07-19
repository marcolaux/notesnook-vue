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
import { AttachmentNode, TaskItemNode, TaskListNode } from "@notesnook-vue/editor-vue";

const editor = new Editor({
  element: document.createElement("div"),
  extensions: [StarterKit, AttachmentNode, TaskListNode, TaskItemNode.configure({ nested: true })],
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

describe("editor node-view round-trip (2.4a)", () => {
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

  it("a note with an attachment + checklist round-trips together (seed-shape)", () => {
    const html =
      '<p>Intro</p><ul class="checklist" data-title="2.4a progress"><li class="checklist--item checked"><p>Attachment chip</p></li><li class="checklist--item"><p>Task list</p></li></ul><p>Sample: <span data-hash="demo-001" data-filename="phase-2.4.md" data-mime="text/markdown" data-size="2048"></span></p>';
    const out = roundTrip(html);
    expect(out).toContain('data-hash="demo-001"');
    expect(out).toContain('data-title="2.4a progress"');
    expect((out.match(/checklist--item/g) || []).length).toBe(2);
  });
});