// @vitest-environment node
/**
 * Remote changelog fetcher bridge test — exercises the main-process
 * `changelogFetcherServer.fetchLatest` with a stubbed `global.fetch` (no
 * Electron, no network). Pins the fetch → text → status flow, the
 * "never throws, reports `error` instead" contract, and the in-memory cache.
 *
 * Each test re-imports the module fresh (`vi.resetModules`) so the
 * module-level success cache doesn't leak between cases.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const SAMPLE = `# Changelog

All notable changes will be documented here.

## [0.14.0] - 2026-08-01
### Added
- Newest version entry

## [0.13.0] - 2026-07-28
### Changed
- Older entry
`;

/** Re-import the fetcher module so the module-level cache is fresh per test. */
async function getServer(): Promise<
  typeof import("../../apps/desktop/src/main/changelog-fetcher").changelogFetcherServer
> {
  vi.resetModules();
  const mod = await import("../../apps/desktop/src/main/changelog-fetcher");
  return mod.changelogFetcherServer;
}

function mockFetchText(body: string, status = 200): ReturnType<typeof vi.fn> {
  const res = { ok: status >= 200 && status < 300, status, text: async () => body };
  const fn = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function mockFetchRejects(): void {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
}

describe("changelogFetcherServer.fetchLatest (bridge)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the raw CHANGELOG.md text with error=null on success", async () => {
    mockFetchText(SAMPLE);
    const server = await getServer();
    const r = await server.fetchLatest();
    expect(r.error).toBeNull();
    expect(r.text).toBe(SAMPLE);
    expect(typeof r.fetchedAt).toBe("string");
    expect(() => new Date(r.fetchedAt).toISOString()).not.toThrow();
  });

  it("returns error='network' (not a throw) when fetch rejects", async () => {
    mockFetchRejects();
    const server = await getServer();
    const r = await server.fetchLatest();
    expect(r.error).toBe("network");
    expect(r.text).toBeNull();
  });

  it("returns error='network' on a non-2xx HTTP status", async () => {
    mockFetchText("oops", 500);
    const server = await getServer();
    const r = await server.fetchLatest();
    expect(r.error).toBe("network");
    expect(r.text).toBeNull();
  });

  it("returns error='parse' when reading the body rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => {
          throw new Error("boom");
        }
      })
    );
    const server = await getServer();
    const r = await server.fetchLatest();
    expect(r.error).toBe("parse");
    expect(r.text).toBeNull();
  });

  it("returns error='parse' when the body is empty", async () => {
    mockFetchText("");
    const server = await getServer();
    const r = await server.fetchLatest();
    expect(r.error).toBe("parse");
    expect(r.text).toBeNull();
  });

  it("caches a successful fetch — a second call does not re-invoke fetch", async () => {
    const fn = mockFetchText(SAMPLE);
    const server = await getServer();
    await server.fetchLatest();
    await server.fetchLatest();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failure — a second call retries", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => SAMPLE });
    vi.stubGlobal("fetch", fn);
    const server = await getServer();
    const first = await server.fetchLatest();
    expect(first.error).toBe("network");
    const second = await server.fetchLatest();
    expect(second.error).toBeNull();
    expect(second.text).toBe(SAMPLE);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});