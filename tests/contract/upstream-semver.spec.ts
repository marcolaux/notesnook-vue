import { describe, it, expect } from "vitest";
import {
  parseReleaseTag,
  compareReleaseTags,
  isNewerUpstreamRelease,
  isDesktopReleaseTag
} from "@contracts/upstream-semver";

describe("parseReleaseTag", () => {
  it("parses a plain v-prefixed tag", () => {
    expect(parseReleaseTag("v3.4.4")).toEqual({ major: 3, minor: 4, patch: 4, prerelease: null });
  });

  it("parses an unprefixed tag", () => {
    expect(parseReleaseTag("3.4.4")).toEqual({ major: 3, minor: 4, patch: 4, prerelease: null });
  });

  it("parses a prerelease suffix", () => {
    expect(parseReleaseTag("v3.4.5-rc.1")).toEqual({
      major: 3,
      minor: 4,
      patch: 5,
      prerelease: "rc.1"
    });
    expect(parseReleaseTag("v3.4.5-beta.1")).toEqual({
      major: 3,
      minor: 4,
      patch: 5,
      prerelease: "beta.1"
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseReleaseTag("  v3.4.4  ")).toEqual({ major: 3, minor: 4, patch: 4, prerelease: null });
  });

  it("returns null for garbage", () => {
    expect(parseReleaseTag("main")).toBeNull();
    expect(parseReleaseTag("v3.4")).toBeNull();
    expect(parseReleaseTag("vX.Y.Z")).toBeNull();
    expect(parseReleaseTag("")).toBeNull();
  });
});

describe("compareReleaseTags", () => {
  it("orders by major/minor/patch", () => {
    expect(compareReleaseTags("v3.4.4", "v3.4.5")).toBe(-1);
    expect(compareReleaseTags("v3.4.5", "v3.4.4")).toBe(1);
    expect(compareReleaseTags("v3.4.4", "v3.4.4")).toBe(0);
    expect(compareReleaseTags("v3.4.10", "v3.4.9")).toBe(1); // numeric, not lexical
    expect(compareReleaseTags("v4.0.0", "v3.9.9")).toBe(1);
    expect(compareReleaseTags("v3.4.0", "v3.5.0")).toBe(-1);
  });

  it("ignores the v prefix", () => {
    expect(compareReleaseTags("3.4.4", "v3.4.4")).toBe(0);
  });

  it("ranks a prerelease below its release", () => {
    expect(compareReleaseTags("v3.4.5-rc.1", "v3.4.5")).toBe(-1);
    expect(compareReleaseTags("v3.4.5", "v3.4.5-rc.1")).toBe(1);
  });

  it("orders prereleases of the same base", () => {
    expect(compareReleaseTags("v3.4.5-rc.1", "v3.4.5-rc.2")).toBe(-1);
    expect(compareReleaseTags("v3.4.5-beta.2", "v3.4.5-rc.1")).toBe(-1); // beta < rc lexically
  });

  it("returns null when either tag is unparseable", () => {
    expect(compareReleaseTags("v3.4.4", "garbage")).toBeNull();
    expect(compareReleaseTags("garbage", "v3.4.4")).toBeNull();
    expect(compareReleaseTags("nope", "also-nope")).toBeNull();
  });
});

describe("isNewerUpstreamRelease", () => {
  it("true when latest is strictly newer", () => {
    expect(isNewerUpstreamRelease("v3.4.5", "v3.4.4")).toBe(true);
    expect(isNewerUpstreamRelease("v4.0.0", "v3.4.4")).toBe(true);
  });

  it("false when equal or older", () => {
    expect(isNewerUpstreamRelease("v3.4.4", "v3.4.4")).toBe(false);
    expect(isNewerUpstreamRelease("v3.4.3", "v3.4.4")).toBe(false);
  });

  it("treats a higher-base prerelease as newer (base wins over the suffix)", () => {
    // v3.4.5-rc.1 is *below* v3.4.5, but vs baseline v3.4.4 its base (3.4.5)
    // is higher, so it counts as newer. In practice this won't arise: the
    // main bridge queries `/releases/latest`, which excludes prereleases.
    expect(isNewerUpstreamRelease("v3.4.5-rc.1", "v3.4.4")).toBe(true);
    // A prerelease of the *same* base as the baseline is NOT newer.
    expect(isNewerUpstreamRelease("v3.4.4-rc.1", "v3.4.4")).toBe(false);
  });

  it("false for unparseable tags (never notify on garbage)", () => {
    expect(isNewerUpstreamRelease("garbage", "v3.4.4")).toBe(false);
    expect(isNewerUpstreamRelease("v3.4.5", "garbage")).toBe(false);
  });
});

describe("isDesktopReleaseTag", () => {
  it("accepts v-prefixed stable tags", () => {
    expect(isDesktopReleaseTag("v3.4.4", false)).toBe(true);
    expect(isDesktopReleaseTag("v3.4.10", false)).toBe(true);
  });

  it("rejects Android tags (no v prefix)", () => {
    expect(isDesktopReleaseTag("3.4.5-android", false)).toBe(false);
    expect(isDesktopReleaseTag("3.3.27-android", false)).toBe(false);
  });

  it("rejects prereleases when the prerelease flag is set", () => {
    expect(isDesktopReleaseTag("v3.4.0-beta.1", true)).toBe(false);
  });

  it("rejects garbage", () => {
    expect(isDesktopReleaseTag("main", false)).toBe(false);
    expect(isDesktopReleaseTag("latest", false)).toBe(false);
  });
});