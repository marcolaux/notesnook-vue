// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  parseDeepLink,
  buildDeepLink,
  NN_PROTOCOL,
  type DeepLinkKind,
  type DeepLinkTarget
} from "@contracts/deep-link";

describe("parseDeepLink", () => {
  it("parses note/notebook/monograph targets", () => {
    expect(parseDeepLink("nn://note/abc123")).toEqual<DeepLinkTarget>({
      kind: "note",
      id: "abc123"
    });
    expect(parseDeepLink("nn://notebook/nb-7")).toEqual<DeepLinkTarget>({
      kind: "notebook",
      id: "nb-7"
    });
    expect(parseDeepLink("nn://monograph/m-42")).toEqual<DeepLinkTarget>({
      kind: "monograph",
      id: "m-42"
    });
  });

  it("tolerates a trailing slash, query, and hash", () => {
    expect(parseDeepLink("nn://note/abc/")).toEqual<DeepLinkTarget>({
      kind: "note",
      id: "abc"
    });
    expect(parseDeepLink("nn://note/abc?foo=bar")).toEqual<DeepLinkTarget>({
      kind: "note",
      id: "abc"
    });
    expect(parseDeepLink("nn://note/abc#section")).toEqual<DeepLinkTarget>({
      kind: "note",
      id: "abc"
    });
    expect(parseDeepLink("nn://note/abc/?x=1#h")).toEqual<DeepLinkTarget>({
      kind: "note",
      id: "abc"
    });
  });

  it("rejects an empty id", () => {
    expect(parseDeepLink("nn://note/")).toBeNull();
    expect(parseDeepLink("nn://note")).toBeNull();
    expect(parseDeepLink("nn://notebook/")).toBeNull();
  });

  it("rejects a multi-segment id", () => {
    expect(parseDeepLink("nn://note/a/b")).toBeNull();
    expect(parseDeepLink("nn://note/a/b/c")).toBeNull();
  });

  it("rejects an unknown kind", () => {
    expect(parseDeepLink("nn://tag/t-1")).toBeNull();
    expect(parseDeepLink("nn://archive/x")).toBeNull();
    expect(parseDeepLink("nn://settings/y")).toBeNull();
  });

  it("rejects a non-nn protocol", () => {
    expect(parseDeepLink("http://note/abc")).toBeNull();
    expect(parseDeepLink("https://note/abc")).toBeNull();
    expect(parseDeepLink("notesnook://note/abc")).toBeNull();
    expect(parseDeepLink("file:///note/abc")).toBeNull();
  });

  it("rejects malformed input without throwing", () => {
    expect(parseDeepLink("not a url")).toBeNull();
    expect(parseDeepLink("")).toBeNull();
    expect(parseDeepLink("://note/abc")).toBeNull();
    expect(parseDeepLink("nn://")).toBeNull();
  });

  it("NN_PROTOCOL is the bare protocol string", () => {
    expect(NN_PROTOCOL).toBe("nn");
    // The kind set is exactly the three supported kinds.
    const kinds: DeepLinkKind[] = ["note", "notebook", "monograph"];
    expect(kinds).toHaveLength(3);
  });
});

describe("buildDeepLink", () => {
  it("builds an nn:// URL from a target", () => {
    expect(buildDeepLink({ kind: "note", id: "abc" })).toBe("nn://note/abc");
    expect(buildDeepLink({ kind: "notebook", id: "nb-7" })).toBe("nn://notebook/nb-7");
    expect(buildDeepLink({ kind: "monograph", id: "m-42" })).toBe("nn://monograph/m-42");
  });

  it("round-trips through parseDeepLink", () => {
    const targets: DeepLinkTarget[] = [
      { kind: "note", id: "abc123" },
      { kind: "notebook", id: "nb-7" },
      { kind: "monograph", id: "m-42" }
    ];
    for (const target of targets) {
      expect(parseDeepLink(buildDeepLink(target))).toEqual(target);
    }
  });
});

describe("blockId (note section links)", () => {
  it("parseDeepLink surfaces a ?blockId= query param", () => {
    expect(parseDeepLink("nn://note/abc?blockId=blk-1")).toEqual<DeepLinkTarget>({
      kind: "note",
      id: "abc",
      blockId: "blk-1"
    });
    expect(parseDeepLink("nn://notebook/nb-7?blockId=x")).toEqual<DeepLinkTarget>({
      kind: "notebook",
      id: "nb-7",
      blockId: "x"
    });
  });

  it("parseDeepLink omits blockId when the query has no blockId", () => {
    // A non-blockId query (e.g. `?foo=bar`) must not set blockId, and the
    // resulting target must still equal a plain `{ kind, id }` (toEqual ignores
    // absent keys — but here blockId is genuinely absent from the object).
    const t = parseDeepLink("nn://note/abc?foo=bar");
    expect(t).toEqual<DeepLinkTarget>({ kind: "note", id: "abc" });
    expect(t).not.toHaveProperty("blockId");
  });

  it("parseDeepLink omits blockId for a plain link", () => {
    expect(parseDeepLink("nn://note/abc")).toEqual<DeepLinkTarget>({
      kind: "note",
      id: "abc"
    });
  });

  it("buildDeepLink appends ?blockId= when present", () => {
    expect(buildDeepLink({ kind: "note", id: "abc", blockId: "blk-1" })).toBe(
      "nn://note/abc?blockId=blk-1"
    );
  });

  it("buildDeepLink omits the query when blockId is absent", () => {
    expect(buildDeepLink({ kind: "note", id: "abc" })).toBe("nn://note/abc");
  });

  it("round-trips a block link through build → parse", () => {
    const target: DeepLinkTarget = { kind: "note", id: "abc", blockId: "blk-1" };
    expect(parseDeepLink(buildDeepLink(target))).toEqual(target);
  });
});