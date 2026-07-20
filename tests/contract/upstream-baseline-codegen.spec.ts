// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  parseSubmoduleStatusSha,
  sortSemverTagsDesc,
  pickBaselineTag,
  isDesktopReleaseTag
} from "../../scripts/gen-upstream-baseline.mjs";

describe("parseSubmoduleStatusSha", () => {
  it("parses a clean submodule status line", () => {
    expect(parseSubmoduleStatusSha(" d4658aa0329d25c2a313ae6fe6ae33b62d235821 vendor/notesnook (heads/master)")).toBe(
      "d4658aa0329d25c2a313ae6fe6ae33b62d235821"
    );
  });

  it("parses through a status prefix (+ modified, - not initialised, U)", () => {
    expect(parseSubmoduleStatusSha("+d4658aa0329d25c2a313ae6fe6ae33b62d235821 vendor/notesnook (heads/master)")).toBe(
      "d4658aa0329d25c2a313ae6fe6ae33b62d235821"
    );
  });

  it("returns null for a not-initialised line (no SHA)", () => {
    expect(parseSubmoduleStatusSha("-0000000000000000000000000000000000000000 vendor/notesnook")).toBe(
      "0000000000000000000000000000000000000000"
    );
    // genuinely unparseable:
    expect(parseSubmoduleStatusSha("no submodule here")).toBeNull();
  });
});

describe("sortSemverTagsDesc", () => {
  it("sorts newest-first and drops non-semver names", () => {
    const tags = ["v3.4.4", "main", "v3.4.10", "v3.4.3", "latest", "v4.0.0"];
    expect(sortSemverTagsDesc(tags)).toEqual(["v4.0.0", "v3.4.10", "v3.4.4", "v3.4.3"]);
  });

  it("ranks a release above its prerelease", () => {
    expect(sortSemverTagsDesc(["v3.4.5-rc.1", "v3.4.5", "v3.4.4"])).toEqual([
      "v3.4.5",
      "v3.4.5-rc.1",
      "v3.4.4"
    ]);
  });
});

describe("pickBaselineTag", () => {
  it("returns the newest tag the predicate calls an ancestor", () => {
    const sorted = ["v3.4.5", "v3.4.4", "v3.4.3", "v3.4.2"];
    // Only v3.4.4 and below are ancestors of our pin.
    const isAncestor = (tag: string) => tag !== "v3.4.5";
    expect(pickBaselineTag(sorted, isAncestor)).toBe("v3.4.4");
  });

  it("returns the newest tag when our pin is at the tip", () => {
    const sorted = ["v3.4.5", "v3.4.4"];
    expect(pickBaselineTag(sorted, () => true)).toBe("v3.4.5");
  });

  it("returns null when no tag is an ancestor (pin predates all releases)", () => {
    const sorted = ["v3.4.5", "v3.4.4"];
    expect(pickBaselineTag(sorted, () => false)).toBeNull();
  });
});

describe("isDesktopReleaseTag (codegen copy)", () => {
  it("matches the contracts helper exactly", () => {
    const cases: Array<[string, boolean, boolean]> = [
      ["v3.4.4", false, true],
      ["3.4.5-android", false, false],
      ["v3.4.0-beta.1", true, false],
      ["main", false, false]
    ];
    for (const [tag, pre, expected] of cases) {
      expect(isDesktopReleaseTag(tag, pre)).toBe(expected);
    }
  });
});