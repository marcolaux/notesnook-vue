/**
 * Contract tests for the "Test connection" server-health module
 * (`platform/server-health.ts`) — the port of upstream web's
 * `servers-configuration.tsx` "Test connection" step. Each editable server is
 * probed at its version endpoint and validated against the expected server
 * id + `isServerCompatible`. These tests stub `fetch` to return canned
 * version documents (or fail) and assert the per-server verdicts so the
 * diagnostic that surfaces a misrouted / incompatible / unreachable
 * self-hosted host stays correct.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  testServerConnections,
  EDITABLE_HOST_KEYS,
  type EditableHostKey
} from "@/platform/server-health";
import { PRODUCTION_HOSTS } from "@/platform/production-hosts.generated";
import type { Hosts } from "@/platform/server-config";

/** Build a Hosts bag overriding the four editable keys. */
function hosts(overrides: Partial<Record<EditableHostKey, string>> = {}): Hosts {
  return { ...PRODUCTION_HOSTS, ...overrides };
}

/** Canned version documents keyed by the host the request was sent to. */
function mockFetch(
  responses: Record<string, { version?: number; id?: string } | Error>
): typeof fetch {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const base = url.replace(/\/(version|api\/version)$/, "");
    const entry = responses[base];
    if (entry instanceof Error) throw entry;
    if (entry === undefined) throw new Error("network error");
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ instance: "test", ...entry })
    } as Response;
  }) as unknown as typeof fetch;
}

describe("testServerConnections", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // AbortSignal is used for the per-request timeout; jsdom/node has it.
    // The module's fetchWithTimeout uses setTimeout — vi's fake timers aren't
    // enabled, so the real timeout is fine (it never fires in these tests).
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("reports ok for every server reporting its correct id + compatible version", async () => {
    globalThis.fetch = mockFetch({
      "https://api.notesnook.com": { version: 1, id: "notesnook-sync" },
      "https://auth.streetwriters.co": { version: 1, id: "auth" },
      "https://events.streetwriters.co": { version: 1, id: "sse" },
      "https://monogr.ph": { version: 1, id: "monograph" }
    });
    const results = await testServerConnections(hosts());
    expect(results.map((r) => r.key)).toEqual([...EDITABLE_HOST_KEYS]);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("hits /version for sync/auth/sse and /api/version for monograph", async () => {
    const fetchMock = mockFetch({
      "https://api.notesnook.com": { version: 1, id: "notesnook-sync" },
      "https://auth.streetwriters.co": { version: 1, id: "auth" },
      "https://events.streetwriters.co": { version: 1, id: "sse" },
      "https://monogr.ph": { version: 1, id: "monograph" }
    });
    globalThis.fetch = fetchMock;
    await testServerConnections(hosts());
    const urls = (fetchMock as unknown as { mock: { calls: string[][] } }).mock.calls.map(
      (c) => c[0]
    );
    expect(urls).toContain("https://api.notesnook.com/version");
    expect(urls).toContain("https://auth.streetwriters.co/version");
    expect(urls).toContain("https://events.streetwriters.co/version");
    expect(urls).toContain("https://monogr.ph/api/version");
  });

  it("flags a server reporting the wrong id as wrongServer", async () => {
    globalThis.fetch = mockFetch({
      "https://api.notesnook.com": { version: 1, id: "auth" }, // misrouted
      "https://auth.streetwriters.co": { version: 1, id: "auth" },
      "https://events.streetwriters.co": { version: 1, id: "sse" },
      "https://monogr.ph": { version: 1, id: "monograph" }
    });
    const results = await testServerConnections(hosts());
    const api = results.find((r) => r.key === "API_HOST")!;
    expect(api.ok).toBe(false);
    expect(api.reason).toBe("wrongServer");
    expect(api.reportedId).toBe("auth");
    expect(results.filter((r) => r.ok)).toHaveLength(3);
  });

  it("flags a server reporting an incompatible version", async () => {
    globalThis.fetch = mockFetch({
      "https://api.notesnook.com": { version: 1, id: "notesnook-sync" },
      "https://auth.streetwriters.co": { version: 1, id: "auth" },
      "https://events.streetwriters.co": { version: 99, id: "sse" },
      "https://monogr.ph": { version: 1, id: "monograph" }
    });
    const results = await testServerConnections(hosts());
    const sse = results.find((r) => r.key === "SSE_HOST")!;
    expect(sse.ok).toBe(false);
    expect(sse.reason).toBe("incompatible");
    expect(sse.reportedVersion).toBe(99);
  });

  it("flags an unreachable server (fetch rejects) as unreachable", async () => {
    globalThis.fetch = mockFetch({
      "https://api.notesnook.com": { version: 1, id: "notesnook-sync" },
      "https://auth.streetwriters.co": { version: 1, id: "auth" },
      "https://events.streetwriters.co": new Error("ENOTFOUND"),
      "https://monogr.ph": { version: 1, id: "monograph" }
    });
    const results = await testServerConnections(hosts());
    const sse = results.find((r) => r.key === "SSE_HOST")!;
    expect(sse.ok).toBe(false);
    expect(sse.reason).toBe("unreachable");
  });

  it("flags a non-OK HTTP status as unreachable", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 502,
      headers: new Headers(),
      json: async () => ({})
    }) as unknown as Response);
    const results = await testServerConnections(hosts());
    expect(results.every((r) => !r.ok && r.reason === "unreachable")).toBe(true);
  });

  it("tests the resolved URL for a custom partial bag (empty field keeps default)", async () => {
    // Self-hoster overrides only API + AUTH; SSE + MONOGRAPH keep production
    // defaults and are still tested against those URLs.
    const fetchMock = mockFetch({
      "https://api.self.example": { version: 1, id: "notesnook-sync" },
      "https://auth.self.example": { version: 1, id: "auth" },
      "https://events.streetwriters.co": { version: 1, id: "sse" },
      "https://monogr.ph": { version: 1, id: "monograph" }
    });
    globalThis.fetch = fetchMock;
    const results = await testServerConnections(
      hosts({ API_HOST: "https://api.self.example", AUTH_HOST: "https://auth.self.example" })
    );
    expect(results.every((r) => r.ok)).toBe(true);
    const api = results.find((r) => r.key === "API_HOST")!;
    expect(api.url).toBe("https://api.self.example");
    const sse = results.find((r) => r.key === "SSE_HOST")!;
    expect(sse.url).toBe("https://events.streetwriters.co"); // default kept
  });
});