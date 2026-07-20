// @vitest-environment node
/**
 * Upstream-release checker bridge test — exercises the main-process
 * `upstreamCheckerServer.check` with a stubbed `global.fetch` (no Electron, no
 * network). Pins the fetch → parse → semver-compare → status flow and the
 * "never throws, reports `error` instead" contract.
 *
 * Test tags are derived from the committed `UPSTREAM_BASELINE.baselineTag` so
 * the suite stays correct after a `gen:upstream-baseline` regen changes the
 * baked baseline.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { upstreamCheckerServer } from "../../apps/desktop/src/main/upstream-checker";
import { UPSTREAM_BASELINE } from "../../apps/desktop/src/contracts/upstream-baseline.generated";
import { parseReleaseTag } from "@contracts/upstream-semver";

/** Bump the patch of a `vX.Y.Z` tag → a strictly newer tag. */
function bumpPatch(tag: string): string {
  const p = parseReleaseTag(tag)!;
  return `v${p.major}.${p.minor}.${p.patch + 1}`;
}
/** Drop the patch → a strictly older tag (assumes patch > 0). */
function dropPatch(tag: string): string {
  const p = parseReleaseTag(tag)!;
  return `v${p.major}.${p.minor}.${Math.max(0, p.patch - 1)}`;
}

const BASELINE = UPSTREAM_BASELINE.baselineTag;

function release(tag: string, opts: { prerelease?: boolean; publishedAt?: string; url?: string } = {}) {
  return {
    tag_name: tag,
    prerelease: opts.prerelease ?? false,
    published_at: opts.publishedAt ?? "2026-07-13T09:23:12Z",
    html_url: opts.url ?? `https://github.com/streetwriters/notesnook/releases/tag/${tag}`
  };
}

function mockFetch(payload: unknown, status = 200): void {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));
}

function mockFetchRejects(): void {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
}

describe("upstreamCheckerServer.check (bridge)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports isNewer=true when the latest desktop release is newer than the baseline", async () => {
    const newer = bumpPatch(BASELINE);
    mockFetch([release(newer), release(BASELINE)]);
    const s = await upstreamCheckerServer.check();
    expect(s.error).toBeNull();
    expect(s.baselineTag).toBe(BASELINE);
    expect(s.latestTag).toBe(newer);
    expect(s.isNewer).toBe(true);
    expect(s.latestUrl).toContain(newer);
  });

  it("reports isNewer=false when the latest equals the baseline", async () => {
    mockFetch([release(BASELINE)]);
    const s = await upstreamCheckerServer.check();
    expect(s.error).toBeNull();
    expect(s.latestTag).toBe(BASELINE);
    expect(s.isNewer).toBe(false);
  });

  it("reports isNewer=false when the latest is older than the baseline", async () => {
    const older = dropPatch(BASELINE);
    mockFetch([release(older)]);
    const s = await upstreamCheckerServer.check();
    expect(s.error).toBeNull();
    expect(s.latestTag).toBe(older);
    expect(s.isNewer).toBe(false);
  });

  it("picks the semver-newest desktop release, ignoring Android + prereleases", async () => {
    const newer = bumpPatch(BASELINE);
    mockFetch([
      release("3.4.5-android"), // Android — ignored (no v prefix)
      release("v3.4.0-beta.1", { prerelease: true }), // prerelease — ignored
      release(BASELINE),
      release(newer)
    ]);
    const s = await upstreamCheckerServer.check();
    expect(s.latestTag).toBe(newer);
    expect(s.isNewer).toBe(true);
  });

  it("returns error='network' (not a throw) when fetch rejects", async () => {
    mockFetchRejects();
    const s = await upstreamCheckerServer.check();
    expect(s.error).toBe("network");
    expect(s.isNewer).toBe(false);
    expect(s.latestTag).toBeNull();
  });

  it("returns error='rate-limit' on HTTP 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => [] }));
    const s = await upstreamCheckerServer.check();
    expect(s.error).toBe("rate-limit");
    expect(s.isNewer).toBe(false);
  });

  it("returns error='network' on a non-rate-limit HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => [] }));
    const s = await upstreamCheckerServer.check();
    expect(s.error).toBe("network");
  });

  it("returns error='parse' when the body is not an array", async () => {
    mockFetch({ not: "an array" });
    const s = await upstreamCheckerServer.check();
    expect(s.error).toBe("parse");
    expect(s.isNewer).toBe(false);
  });

  it("returns error='parse' when no desktop-stable release is present", async () => {
    mockFetch([release("3.4.5-android"), release("v3.4.0-beta.1", { prerelease: true })]);
    const s = await upstreamCheckerServer.check();
    expect(s.error).toBe("parse");
    expect(s.latestTag).toBeNull();
  });

  it("always sets checkedAt (ISO) and echoes the baked baseline", async () => {
    mockFetch([release(BASELINE)]);
    const s = await upstreamCheckerServer.check();
    expect(typeof s.checkedAt).toBe("string");
    expect(() => new Date(s.checkedAt).toISOString()).not.toThrow();
    expect(s.baselineTag).toBe(BASELINE);
  });
});