// @vitest-environment happy-dom
/**
 * Tag-mention reconcile contract tests (Phase 5.4).
 *
 * Covers the two-way sync between inline `#tag` chips and the note's tag
 * assignments: the pure helpers (`collectTagMentionTagIds`,
 * `findOrphanTagMentionRanges`, `diffDeletedTagIds`) that drive it, and the
 * `reconcileTagMentions` editor command that strips orphan chips. Runs under
 * happy-dom (per-file env override) like `editor-html.spec.ts`, building a
 * headless `Editor` with the `TagMention` node and driving it via
 * `editor.commands` / `schema.nodeFromJSON`.
 */
import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  TagMention,
  RECONCILE_META,
  collectTagMentionTagIds,
  findOrphanTagMentionRanges,
  diffDeletedTagIds
} from "@notesnook-vue/editor-vue";

const editor = new Editor({
  element: document.createElement("div"),
  extensions: [StarterKit.configure({ codeBlock: false }), TagMention],
  content: ""
});

/** Build a doc with the given chip `tagId`s interleaved with text, as JSON. */
function docWithChips(tagIds: string[]): Record<string, unknown> {
  const content: Record<string, unknown>[] = [{ type: "text", text: "x" }];
  for (const id of tagIds) {
    content.push({ type: "tagMention", attrs: { tagId: id, title: id } });
    content.push({ type: "text", text: " " });
  }
  return { type: "doc", content: [{ type: "paragraph", content }] };
}

afterAll(() => editor.destroy());
beforeEach(() => {
  editor.commands.clearContent();
});

describe("tag-mention reconcile — pure helpers", () => {
  it("collectTagMentionTagIds gathers every chip's tagId", () => {
    editor.commands.setContent(docWithChips(["a", "b", "c"]) as never);
    const ids = collectTagMentionTagIds(editor.state.doc);
    expect(ids).toEqual(new Set(["a", "b", "c"]));
  });

  it("findOrphanTagMentionRanges flags only chips absent from the allowed set", () => {
    editor.commands.setContent(docWithChips(["keep", "orphan1", "orphan2"]) as never);
    const ranges = findOrphanTagMentionRanges(editor.state.doc, new Set(["keep"]));
    // One range per orphan chip; positions are in document order.
    expect(ranges).toHaveLength(2);
    expect(ranges[0].pos).toBeLessThan(ranges[1].pos);
    expect(ranges.every((r) => r.size > 0)).toBe(true);
  });

  it("findOrphanTagMentionRanges is empty when every chip is assigned", () => {
    editor.commands.setContent(docWithChips(["a", "b"]) as never);
    const ranges = findOrphanTagMentionRanges(editor.state.doc, new Set(["a", "b"]));
    expect(ranges).toEqual([]);
  });

  it("diffDeletedTagIds returns ids present before but absent after", () => {
    expect(diffDeletedTagIds(new Set(["a", "b", "c"]), new Set(["b", "d"]))).toEqual([
      "a",
      "c"
    ]);
    expect(diffDeletedTagIds(new Set(["a"]), new Set(["a", "b"]))).toEqual([]);
  });
});

describe("tag-mention reconcile — reconcileTagMentions command", () => {
  it("strips orphan chips and keeps assigned chips", () => {
    editor.commands.setContent(docWithChips(["keep", "drop"]) as never);
    expect(collectTagMentionTagIds(editor.state.doc)).toEqual(new Set(["keep", "drop"]));

    const changed = editor.commands.reconcileTagMentions(["keep"]);

    expect(changed).toBe(true);
    expect(collectTagMentionTagIds(editor.state.doc)).toEqual(new Set(["keep"]));
  });

  it("is a no-op (returns false, no doc change) when nothing is orphan", () => {
    editor.commands.setContent(docWithChips(["a", "b"]) as never);
    const before = editor.state.doc;
    const changed = editor.commands.reconcileTagMentions(["a", "b"]);
    expect(changed).toBe(false);
    expect(editor.state.doc).toBe(before); // same doc reference → not replaced
  });

  it("marks its transaction with RECONCILE_META so the deletion handler skips it", () => {
    editor.commands.setContent(docWithChips(["drop"]) as never);
    let seen: boolean | undefined;
    const off = (): void => editor.off("transaction", onTr);
    function onTr({ transaction }: { transaction: { getMeta: (k: string) => unknown } }): void {
      seen = transaction.getMeta(RECONCILE_META) === true;
    }
    editor.on("transaction", onTr);
    try {
      editor.commands.reconcileTagMentions([]);
    } finally {
      off();
    }
    expect(seen).toBe(true);
  });

  it("silent option sets preventUpdate so a load-time strip does not autosave", () => {
    editor.commands.setContent(docWithChips(["drop"]) as never);
    let prevent: unknown;
    function onTr({ transaction }: { transaction: { getMeta: (k: string) => unknown } }): void {
      if (transaction.getMeta(RECONCILE_META) === true) {
        prevent = transaction.getMeta("preventUpdate");
      }
    }
    editor.on("transaction", onTr);
    try {
      editor.chain().reconcileTagMentions([], { silent: true }).run();
    } finally {
      editor.off("transaction", onTr);
    }
    expect(prevent).toBe(true);
  });
});