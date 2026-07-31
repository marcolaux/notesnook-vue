/*
Unit tests for the PURE move logic of the list drag-reorder plugin
(`reorderFragment` / `nestInsert` / `deleteSourceGroup`). These exercise
the doc transform that `handleDrop` runs — the part that can corrupt the
document if a list is emptied or a bare item lands inside another item — without
needing an `EditorView` (the band-resolution in `computeDropTarget` is
view-dependent and not covered here).

A minimal ProseMirror schema stands in for the editor's: `bulletList`/`listItem`
model the REAL-nesting types (indent = depth), `taskList`/`taskItem` (with an
`indent` attr) models the FLAT checklist types.
*/
import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import {
  computeDragGroup,
  deleteSourceGroup,
  itemAncestorChain,
  LIST_ITEM_TYPES,
  LIST_ITEM_OF,
  LIST_NODE_TYPES,
  nestInsert,
  realNestingDropTarget,
  reorderFragment
} from "../../packages/editor-vue/src/extensions/list-drag-reorder/drag-group";
import { findParentNodeClosestToPos } from "../../packages/editor-vue/src/utils/prosemirror";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*", toDOM: () => ["p", 0] },
    bulletList: { group: "block", content: "listItem+", toDOM: () => ["ul", 0] },
    listItem: { content: "paragraph block*", toDOM: () => ["li", 0] },
    taskList: { group: "block", content: "taskItem+", toDOM: () => ["ul", 0] },
    taskItem: {
      group: "block",
      content: "paragraph block*",
      attrs: { indent: { default: 0 } },
      toDOM: () => ["li", 0]
    },
    text: { group: "inline" }
  }
});

const p = (text: string) => schema.nodes.paragraph.create(null, schema.text(text));
const li = (...content: ReturnType<typeof p>[]) => schema.nodes.listItem.create(null, content);
const ul = (...items: ReturnType<typeof li>[]) => schema.nodes.bulletList.create(null, items);
const ti = (indent: number, text: string) => schema.nodes.taskItem.create({ indent }, p(text));
const tl = (...items: ReturnType<typeof ti>[]) => schema.nodes.taskList.create(null, items);
const doc = (...blocks: ReturnType<typeof ul>[]) => schema.nodes.doc.create(null, blocks);

/** Compact structural dump: `bulletList(listItem(A),listItem(S))`, taskItems carry `[indent]`. */
function dump(node: ReturnType<typeof doc>): string {
  if (node.isText) return node.text ?? "";
  const inner: string[] = [];
  node.forEach((child) => inner.push(dump(child as ReturnType<typeof doc>)));
  if (node.type.name === "paragraph") return inner.join("");
  let label = node.type.name;
  if (node.type.name === "taskItem") label += `[${node.attrs.indent}]`;
  return `${label}(${inner.join(",")})`;
}

/** Position of the list ITEM whose paragraph text is `text`. */
function itemPos(d: ReturnType<typeof doc>, text: string): number {
  let found = -1;
  d.descendants((node, pos) => {
    if (found === -1 && node.isText && node.text === text) found = pos;
    return true;
  });
  if (found === -1) throw new Error(`no item with text ${text}`);
  const item = findParentNodeClosestToPos(d.resolve(found), (n) =>
    LIST_ITEM_TYPES.has(n.type.name)
  );
  if (!item) throw new Error(`no list item around ${text}`);
  return item.pos;
}

/** The list node containing `pos` (the list a drop at `pos` lands in). */
function listAround(d: ReturnType<typeof doc>, pos: number) {
  const list = findParentNodeClosestToPos(d.resolve(pos), (n) =>
    LIST_NODE_TYPES.has(n.type.name)
  );
  if (!list) throw new Error(`no list around pos ${pos}`);
  return list;
}

/** The target item/list type names a drop at `pos` converts to (what
 *  `computeDropTarget` attaches to a `DropTarget`). */
function targetTypesAt(d: ReturnType<typeof doc>, pos: number) {
  const list = listAround(d, pos);
  return {
    targetItemType: LIST_ITEM_OF[list.node.type.name],
    targetListType: list.node.type.name
  };
}

/** Apply a `reorder` drop (delete source, clean up, insert re-leveled fragment). */
function applyReorder(
  d: ReturnType<typeof doc>,
  grabbedText: string,
  insertPos: number,
  baseIndent: number | null
): ReturnType<typeof doc> {
  const source = computeDragGroup(d, itemPos(d, grabbedText))!;
  const t = targetTypesAt(d, insertPos);
  const tr = EditorState.create({ doc: d }).tr;
  deleteSourceGroup(tr, d, source);
  const frag = reorderFragment(d, source, baseIndent, t.targetItemType, t.targetListType);
  if (!frag) throw new Error("reorderFragment returned null");
  tr.insert(tr.mapping.map(insertPos), frag);
  return tr.doc as ReturnType<typeof doc>;
}

/** Apply a `nest` drop (delete source, clean up, insert nested fragment). */
function applyNest(
  d: ReturnType<typeof doc>,
  grabbedText: string,
  targetText: string,
  before = false
): ReturnType<typeof doc> {
  const source = computeDragGroup(d, itemPos(d, grabbedText))!;
  const tPos = itemPos(d, targetText);
  const t = targetTypesAt(d, tPos);
  const nested = nestInsert(d, source, tPos, before, t.targetItemType, t.targetListType);
  if (!nested) throw new Error("nestInsert returned null");
  const tr = EditorState.create({ doc: d }).tr;
  deleteSourceGroup(tr, d, source);
  tr.insert(tr.mapping.map(nested.insertPos), nested.fragment);
  return tr.doc as ReturnType<typeof doc>;
}

/** Apply a real-nesting drop: grab `grabbedText`, hover the row `rowText` at
 *  `targetDepth` (0 = top level), before/after the anchor. Mirrors what the
 *  plugin's `handleDrop` runs for a resolved `realNestingDropTarget`. */
function applyRealNestingDrop(
  d: ReturnType<typeof doc>,
  grabbedText: string,
  rowText: string,
  targetDepth: number,
  before = false
): ReturnType<typeof doc> {
  const source = computeDragGroup(d, itemPos(d, grabbedText))!;
  const t = realNestingDropTarget(d, itemPos(d, rowText), targetDepth, before, source);
  if (!t) throw new Error("realNestingDropTarget returned null");
  const tr = EditorState.create({ doc: d }).tr;
  if (t.kind === "reorder") {
    const tt = targetTypesAt(d, t.insertPos);
    deleteSourceGroup(tr, d, source);
    const frag = reorderFragment(d, source, t.baseIndent, tt.targetItemType, tt.targetListType);
    if (!frag) throw new Error("reorderFragment returned null");
    tr.insert(tr.mapping.map(t.insertPos), frag);
  } else {
    const tt = targetTypesAt(d, t.targetPos);
    const nested = nestInsert(d, source, t.targetPos, t.before, tt.targetItemType, tt.targetListType);
    if (!nested) throw new Error("nestInsert returned null");
    deleteSourceGroup(tr, d, source);
    tr.insert(tr.mapping.map(nested.insertPos), nested.fragment);
  }
  return tr.doc as ReturnType<typeof doc>;
}

describe("list drag-reorder: real-nesting (bulletList/listItem)", () => {
  it("outdents a child to its parent's level (level 2 → 1), dropping it as a sibling", () => {
    // bulletList[ A( + nested[S] ), B ]
    const d = doc(ul(li(p("A"), ul(li(p("S")))), li(p("B"))));
    expect(dump(d)).toBe("doc(bulletList(listItem(A,bulletList(listItem(S))),listItem(B)))");

    // Drop S as a sibling BEFORE B (insertPos = B's pos, depth follows B's list).
    const out = applyReorder(d, "S", itemPos(d, "B"), null);
    // S is now a top-level item; A's emptied nested list is gone.
    expect(dump(out)).toBe("doc(bulletList(listItem(A),listItem(S),listItem(B)))");
  });

  it("outdents the SOLE child (cleans up the emptied nested list, no bare item)", () => {
    // bulletList[ A( + nested[S] ) ] — S is A's only child.
    const d = doc(ul(li(p("A"), ul(li(p("S"))))));
    const source = computeDragGroup(d, itemPos(d, "S"))!;
    // Drop S before A (A is its own ancestor → sibling band is an outdent).
    const out = applyReorder(d, "S", itemPos(d, "A"), null);
    expect(dump(out)).toBe("doc(bulletList(listItem(S),listItem(A)))");
    // The emptied nested list must have been removed (A has no child list).
    expect(dump(out).includes("bulletList(listItem(A,bulletList")).toBe(false);
    expect(source.listType).toBe("bulletList");
  });

  it("indents a sibling under an item with no child list (creates the child list)", () => {
    // bulletList[ A, B ] → nest B under A.
    const d = doc(ul(li(p("A")), li(p("B"))));
    const out = applyNest(d, "B", "A");
    expect(dump(out)).toBe("doc(bulletList(listItem(A,bulletList(listItem(B)))))");
  });

  it("rejects nesting an item onto its own current parent (no-op, no corruption)", () => {
    // bulletList[ A( + nested[S] ) ] — S is already A's child.
    const d = doc(ul(li(p("A"), ul(li(p("S"))))));
    const source = computeDragGroup(d, itemPos(d, "S"))!;
    expect(nestInsert(d, source, itemPos(d, "A"), false)).toBeNull();
  });

  it("outdents a child to AFTER its parent (the previously-impossible gesture)", () => {
    // bulletList[ A( + nested[S] ), B ] — drop S after A's subtree at A's level.
    // `insertPos = A.end` (after A's whole subtree, in the outer list) is what
    // computeDropTarget now yields for an outdent dragged to A's indent on the
    // bottom half of A's own row.
    const d = doc(ul(li(p("A"), ul(li(p("S")))), li(p("B"))));
    const aEnd = itemPos(d, "A") + d.nodeAt(itemPos(d, "A"))!.nodeSize;
    const out = applyReorder(d, "S", aEnd, null);
    expect(dump(out)).toBe("doc(bulletList(listItem(A),listItem(S),listItem(B)))");
  });

  it("outdents a level-3 item all the way to level 1 in one move", () => {
    // bulletList[ A( + nested[ B( + nested[ S ] ) ] ) ] — S is at level 3.
    const d = doc(ul(li(p("A"), ul(li(p("B"), ul(li(p("S"))))))));
    // Drop S after A's subtree at level 1 (insertPos = A.end, outer list).
    const aEnd = itemPos(d, "A") + d.nodeAt(itemPos(d, "A"))!.nodeSize;
    const out = applyReorder(d, "S", aEnd, null);
    // S becomes a top-level sibling after A. B (level 2) stays nested under A;
    // only B's now-empty child list (which held S) is removed.
    expect(dump(out)).toBe("doc(bulletList(listItem(A,bulletList(listItem(B))),listItem(S)))");
  });

  it("nests a sibling as the FIRST child when `before` is set", () => {
    // bulletList[ A( + nested[C] ), B ] → nest B under A as first child.
    const d = doc(ul(li(p("A"), ul(li(p("C")))), li(p("B"))));
    const out = applyNest(d, "B", "A", true);
    expect(dump(out)).toBe("doc(bulletList(listItem(A,bulletList(listItem(B),listItem(C)))))");
  });
});

describe("list drag-reorder: flat checklist (taskList/taskItem, indent attr)", () => {
  it("outdents a sub-task to the root by re-leveling to the sibling's indent", () => {
    // taskList[ X(0), S(1) ] → drop S before X at X's indent (0).
    const d = doc(tl(ti(0, "X"), ti(1, "S")));
    const out = applyReorder(d, "S", itemPos(d, "X"), 0);
    expect(dump(out)).toBe("doc(taskList(taskItem[0](S),taskItem[0](X)))");
  });

  it("indents a sibling under an item by re-leveling to target.indent + 1", () => {
    // taskList[ X(0), S(0) ] → nest S under X.
    const d = doc(tl(ti(0, "X"), ti(0, "S")));
    const out = applyNest(d, "S", "X");
    expect(dump(out)).toBe("doc(taskList(taskItem[0](X),taskItem[1](S)))");
  });

  it("moves a whole group (parent + higher-indent followers) preserving relative structure", () => {
    // taskList[ X(0), A(1), B(2), Y(0) ] → grab A; its group is A,B. Drop before Y at indent 0.
    const d = doc(tl(ti(0, "X"), ti(1, "A"), ti(2, "B"), ti(0, "Y")));
    const source = computeDragGroup(d, itemPos(d, "A"))!;
    expect(source.to - source.from).toBeGreaterThan(d.nodeAt(itemPos(d, "A"))!.nodeSize); // includes B
    const out = applyReorder(d, "A", itemPos(d, "Y"), 0);
    // A→0, B→1 (relative structure preserved), placed before Y.
    expect(dump(out)).toBe("doc(taskList(taskItem[0](X),taskItem[0](A),taskItem[1](B),taskItem[0](Y)))");
  });
});

describe("list drag-reorder: depth-target model (realNestingDropTarget)", () => {
  // A > B > C > S : A level 1 (depth 0), B level 2, C level 3, S level 4 (depth 3).
  const deep = () =>
    doc(ul(li(p("A"), ul(li(p("B"), ul(li(p("C"), ul(li(p("S"))))))))));

  it("itemAncestorChain lists items outermost-first (depth 0 .. row)", () => {
    const d = deep();
    const chain = itemAncestorChain(d, itemPos(d, "S"));
    expect(chain.length).toBe(4); // A, B, C, S
    expect(chain.map((c) => dump(c.node as ReturnType<typeof doc>))).toEqual([
      "listItem(A,bulletList(listItem(B,bulletList(listItem(C,bulletList(listItem(S)))))))",
      "listItem(B,bulletList(listItem(C,bulletList(listItem(S)))))",
      "listItem(C,bulletList(listItem(S)))",
      "listItem(S)"
    ]);
  });

  it("outdents a level-4 child all the way to level 1 (depth 0) in one gesture", () => {
    // Hover the top-level item A, target depth 0, before it.
    const out = applyRealNestingDrop(deep(), "S", "A", 0, true);
    // S becomes a top-level item before A; C's emptied child list is removed,
    // B and C stay nested under A.
    expect(dump(out)).toBe(
      "doc(bulletList(listItem(S),listItem(A,bulletList(listItem(B,bulletList(listItem(C)))))))"
    );
  });

  it("outdents a level-4 child to level 2 (depth 1)", () => {
    // Hover B (depth 1), target depth 1, before it → S becomes B's sibling.
    const out = applyRealNestingDrop(deep(), "S", "B", 1, true);
    expect(dump(out)).toBe(
      "doc(bulletList(listItem(A,bulletList(listItem(S),listItem(B,bulletList(listItem(C)))))))"
    );
  });

  it("outdents a level-4 child to level 3 (depth 2)", () => {
    // Hover C (depth 2), target depth 2, before it → S becomes C's sibling.
    const out = applyRealNestingDrop(deep(), "S", "C", 2, true);
    expect(dump(out)).toBe(
      "doc(bulletList(listItem(A,bulletList(listItem(B,bulletList(listItem(S),listItem(C)))))))"
    );
  });

  it("outdents to level 1 AFTER the ancestor (bottom half)", () => {
    // Hover A, target depth 0, after A's subtree.
    const out = applyRealNestingDrop(deep(), "S", "A", 0, false);
    expect(dump(out)).toBe(
      "doc(bulletList(listItem(A,bulletList(listItem(B,bulletList(listItem(C))))),listItem(S)))"
    );
  });

  it("moves a child across branches to level 1 next to an unrelated item", () => {
    // bulletList[ A(B(C(S))), D ] → grab S, hover D at depth 0 before it.
    const d = doc(
      ul(li(p("A"), ul(li(p("B"), ul(li(p("C"), ul(li(p("S")))))))), li(p("D")))
    );
    const out = applyRealNestingDrop(d, "S", "D", 0, true);
    expect(dump(out)).toBe(
      "doc(bulletList(listItem(A,bulletList(listItem(B,bulletList(listItem(C))))),listItem(S),listItem(D)))"
    );
  });

  it("nests a child under an unrelated leaf item (creates its child list)", () => {
    // bulletList[ A(B(C(S))), D ] → grab S, hover D, nest (depth 1).
    const d = doc(
      ul(li(p("A"), ul(li(p("B"), ul(li(p("C"), ul(li(p("S")))))))), li(p("D")))
    );
    const out = applyRealNestingDrop(d, "S", "D", 1, false);
    expect(dump(out)).toBe(
      "doc(bulletList(listItem(A,bulletList(listItem(B,bulletList(listItem(C))))),listItem(D,bulletList(listItem(S)))))"
    );
  });

  it("rejects a self-drop (hovering the grabbed item's own position at its depth)", () => {
    // Grabbing S and "hovering" S at its own depth → insertPos lands on the
    // source boundary → no-op (realNestingDropTarget returns null).
    const d = deep();
    const source = computeDragGroup(d, itemPos(d, "S"))!;
    expect(realNestingDropTarget(d, itemPos(d, "S"), 3, true, source)).toBeNull();
  });
});

describe("list drag-reorder: cross-tree + cross-type conversion", () => {
  it("moves an item across a non-list block into another list (the divider case)", () => {
    // bulletList[A], p("between"), bulletList[Z] → drag A before Z. Same item
    // type, so the fast path runs; the first list is deleted as emptied and the
    // target position shifts through the deletion mapping.
    const d = doc(ul(li(p("A"))), p("between"), ul(li(p("Z"))));
    const out = applyReorder(d, "A", itemPos(d, "Z"), null);
    expect(dump(out)).toBe("doc(between,bulletList(listItem(A),listItem(Z)))");
  });

  it("converts a real-nesting item to a flat checklist row (real → flat)", () => {
    // bulletList[A], taskList[X(0)] → drag A before X. A becomes a taskItem at
    // X's indent (0); the emptied bulletList is removed.
    const d = doc(ul(li(p("A"))), tl(ti(0, "X")));
    const out = applyReorder(d, "A", itemPos(d, "X"), 0);
    expect(dump(out)).toBe("doc(taskList(taskItem[0](A),taskItem[0](X)))");
  });

  it("converts a flat indented group to a real-nested tree (flat → real)", () => {
    // taskList[X(0), A(1), B(2)], bulletList[Y] → grab A (group A,B), drop before
    // Y. A,B become a real-nested listItem tree (A with child B); X stays.
    const d = doc(tl(ti(0, "X"), ti(1, "A"), ti(2, "B")), ul(li(p("Y"))));
    const out = applyReorder(d, "A", itemPos(d, "Y"), null);
    expect(dump(out)).toBe(
      "doc(taskList(taskItem[0](X)),bulletList(listItem(A,bulletList(listItem(B))),listItem(Y)))"
    );
  });

  it("nests a real-nesting item under a flat target, converting to the target type", () => {
    // bulletList[A, B], taskList[X(0)] → nest B under X. B becomes a taskItem at
    // X.indent + 1 (1); A remains in the (now single-item) bulletList.
    const d = doc(ul(li(p("A")), li(p("B"))), tl(ti(0, "X")));
    const out = applyNest(d, "B", "X");
    expect(dump(out)).toBe(
      "doc(bulletList(listItem(A)),taskList(taskItem[0](X),taskItem[1](B)))"
    );
  });
});