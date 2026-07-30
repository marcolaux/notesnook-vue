// @vitest-environment happy-dom
/**
 * Tests for the block-id resolver used by "Copy deep link to block"
 * (`utils/editor-block-link.ts`). The id scheme mirrors core's
 * `insertBlockIds` (`vendor/.../content-types/tiptap.ts`): a SINGLE global
 * counter incremented for every block-level tag in `BLOCK_TAGS` in document
 * order, producing `${tagName}${counter}` ids. `blockIdForElement` is the
 * testable core; we build a DOM fragment by hand and pin the exact ids so the
 * helper stays in lockstep with core (and with what the NoteLinkPicker shows
 * via `contentBlocks`).
 */
import { describe, it, expect } from "vitest";
import { blockIdForElement, BLOCK_TAGS } from "@/utils/editor-block-link";

/** Build a fragment from an HTML string and return its `body`-equivalent root. */
function root(html: string): Element {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

/** The i-th element matching `BLOCK_TAGS` in document order within `root`. */
function blockAt(root: Element, i: number): Element {
  let n = -1;
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (BLOCK_TAGS.has(el.tagName.toLowerCase())) {
      n += 1;
      if (n === i) return el;
    }
  }
  throw new Error(`block ${i} not found`);
}

describe("blockIdForElement — global counter + document order", () => {
  // <p>..</p><h1>..</h1><blockquote><p>..</p></blockquote><ul><li><p>..</p></li></ul>
  // core's insertBlockIds counts: p(1)=p1, h1(2)=h12, blockquote(3)=blockquote3,
  // inner p(4)=p4, ul(5)=ul5, inner p(6)=p6. (Single global counter, NOT per-tag.)
  const HTML =
    "<p>one</p>" +
    "<h1>two</h1>" +
    "<blockquote><p>three</p></blockquote>" +
    "<ul><li><p>four</p></li></ul>";

  it("assigns p1 to the first <p>", () => {
    const r = root(HTML);
    expect(blockIdForElement(blockAt(r, 0), r)).toBe("p1");
  });

  it("assigns h12 to the <h1> (global counter, not per-tag)", () => {
    const r = root(HTML);
    expect(blockIdForElement(blockAt(r, 1), r)).toBe("h12");
  });

  it("assigns blockquote3 to the <blockquote>", () => {
    const r = root(HTML);
    expect(blockIdForElement(blockAt(r, 2), r)).toBe("blockquote3");
  });

  it("assigns p4 to the <p> nested in the <blockquote> (innermost block)", () => {
    const r = root(HTML);
    expect(blockIdForElement(blockAt(r, 3), r)).toBe("p4");
  });

  it("assigns ul5 to the <ul>", () => {
    const r = root(HTML);
    expect(blockIdForElement(blockAt(r, 4), r)).toBe("ul5");
  });

  it("assigns p6 to the <p> nested in the <ul><li> (innermost block)", () => {
    const r = root(HTML);
    expect(blockIdForElement(blockAt(r, 5), r)).toBe("p6");
  });

  it("counts <pre>/<img>/<iframe>/<div>/<ol> as blocks with the shared counter", () => {
    const r = root("<pre>c</pre><img src=x><iframe></iframe><div>d</div><ol><li><p>e</p></li></ol>");
    expect(blockIdForElement(blockAt(r, 0), r)).toBe("pre1");
    expect(blockIdForElement(blockAt(r, 1), r)).toBe("img2");
    expect(blockIdForElement(blockAt(r, 2), r)).toBe("iframe3");
    expect(blockIdForElement(blockAt(r, 3), r)).toBe("div4");
    expect(blockIdForElement(blockAt(r, 4), r)).toBe("ol5");
    expect(blockIdForElement(blockAt(r, 5), r)).toBe("p6");
  });

  it("ignores non-block tags (they do not advance the counter)", () => {
    const r = root("<span>x</span><table><tbody><tr><td><p>y</p></td></tr></tbody></table>");
    // Only the inner <p> is a counted block → p1.
    expect(blockIdForElement(r.querySelector("p")!, r)).toBe("p1");
  });
});

describe("blockIdForElement — edge cases", () => {
  it("returns null when the target is not a counted block tag", () => {
    const r = root("<p>one</p><table></table>");
    expect(blockIdForElement(r.querySelector("table")!, r)).toBeNull();
  });

  it("returns null when the target is not reachable from root", () => {
    const r = root("<p>one</p>");
    const other = root("<p>two</p>");
    expect(blockIdForElement(other.querySelector("p")!, r)).toBeNull();
  });

  it("does not count the root element itself", () => {
    const r = root("<p>one</p>");
    // The root is a <div> (a counted tag) but must NOT be matched/counted.
    expect(blockIdForElement(r, r)).toBeNull();
    expect(blockIdForElement(r.querySelector("p")!, r)).toBe("p1");
  });

  it("handles heading levels h2..h6 with the shared counter", () => {
    const r = root("<h2>a</h2><h3>b</h3><h6>c</h6>");
    expect(blockIdForElement(blockAt(r, 0), r)).toBe("h21");
    expect(blockIdForElement(blockAt(r, 1), r)).toBe("h32");
    expect(blockIdForElement(blockAt(r, 2), r)).toBe("h63");
  });
});