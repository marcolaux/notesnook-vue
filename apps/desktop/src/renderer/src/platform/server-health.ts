/**
 * Server "Test connection" — port of upstream's
 * `apps/web/src/dialogs/settings/components/servers-configuration.tsx`
 * "Test connection" step, adapted to our partial-bag custom-server model.
 *
 * Upstream's web client, before saving a self-hosted server config, fetches a
 * small version document from each of the four user-editable servers and
 * validates two things: (1) the server reports the **right identity**
 * (`version.id` === the expected `ServerId` — "notesnook-sync"/"auth"/"sse"/
 * "monograph"), so a URL pointed at the wrong service is caught; and
 * (2) the server reports a **compatible API version**
 * (`isServerCompatible(version.version)`, i.e. `COMPATIBLE_SERVER_VERSION === 1`,
 * re-exported from `@notesnook-vue/contracts`). Only on success does it let the
 * user save. Our `applyServerConfig` previously validated URL syntax only, so a
 * misrouted or stale self-hosted host failed later at login with a generic
 * "not responding" error — this surfaces the exact cause per server instead.
 *
 * Difference from upstream: upstream requires all four fields filled and
 * throws "allServerUrlsRequired" otherwise. Our custom profile is a *partial*
 * bag (an empty field keeps the production default for that component — see
 * `server-config.ts:resolveHosts`), so we resolve each of the four hosts
 * against the merged bag and test the resolved URL, never rejecting an empty
 * field. The four editable hosts + their version endpoints + expected server
 * ids below mirror upstream's `SERVERS` array verbatim.
 */
import { isServerCompatible } from "@notesnook-vue/contracts";
import type { Hosts } from "./server-config";

/** The four server ids upstream's web Settings → Servers validates. */
export type ServerId = "notesnook-sync" | "auth" | "sse" | "monograph";

/** The four hosts a self-hoster can edit (the rest stay at their defaults). */
export type EditableHostKey =
  | "API_HOST"
  | "AUTH_HOST"
  | "SSE_HOST"
  | "MONOGRAPH_HOST";

/** Per-server test metadata — mirrors upstream's `SERVERS` array. */
interface ServerSpec {
  key: EditableHostKey;
  id: ServerId;
  /** Path appended to the host URL to fetch the version document. `/version` for
   *  sync/auth/sse, `/api/version` for the monograph server. */
  versionEndpoint: string;
}

const SERVERS: ServerSpec[] = [
  { key: "API_HOST", id: "notesnook-sync", versionEndpoint: "/version" },
  { key: "AUTH_HOST", id: "auth", versionEndpoint: "/version" },
  { key: "SSE_HOST", id: "sse", versionEndpoint: "/version" },
  { key: "MONOGRAPH_HOST", id: "monograph", versionEndpoint: "/api/version" }
];

/** Shape of the version document every Notesnook server returns at its
 *  version endpoint. */
interface VersionResponse {
  version: number;
  id: string;
  instance: string;
}

export type ServerTestReason = "unreachable" | "wrongServer" | "incompatible";

export interface ServerTestResult {
  /** Which editable host this result is for. */
  key: EditableHostKey;
  /** The URL that was actually tested (the resolved host, after defaults). */
  url: string;
  /** True iff the server reported the right id AND a compatible version. */
  ok: boolean;
  /** Present (and `ok === false`) when the test failed. */
  reason?: ServerTestReason | undefined;
  /** What the server reported, for diagnostics when `ok === false`. */
  reportedId?: string | undefined;
  reportedVersion?: number | undefined;
}

/** Fetch with a hard timeout so an unreachable host doesn't hang the test.
 *  8s is generous for a LAN self-hosted box and matches the order of the
 *  login request's own failure window. */
async function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Test the four editable servers in a resolved `Hosts` bag. Each is fetched
 * independently; one server being down does not prevent the others from being
 * reported. Returns one result per server (in `SERVERS` order).
 *
 * Pass the *resolved* bag (`resolveHosts(config)`) so empty custom fields
 * inherit their production default and are still tested — a self-hoster who
 * only runs the sync + auth servers (and leaves SSE at the default) gets a
 * real result for SSE rather than an "all URLs required" rejection.
 */
export async function testServerConnections(
  hosts: Hosts
): Promise<ServerTestResult[]> {
  const results = await Promise.all(
    SERVERS.map(async (server): Promise<ServerTestResult> => {
      const url = hosts[server.key];
      const result: ServerTestResult = { key: server.key, url, ok: false };
      try {
        const response = await fetchWithTimeout(`${url}${server.versionEndpoint}`);
        if (!response.ok) {
          return { ...result, reason: "unreachable" };
        }
        const version = (await response.json()) as Partial<VersionResponse>;
        if (
          typeof version.version !== "number" ||
          typeof version.id !== "string"
        ) {
          // Not a Notesnook version document (e.g. a generic 200 from a
          // reverse proxy's default route) — treat as the wrong server.
          return {
            ...result,
            reason: "wrongServer",
            reportedId: version.id,
            reportedVersion: version.version
          };
        }
        if (version.id !== server.id) {
          return {
            ...result,
            reason: "wrongServer",
            reportedId: version.id,
            reportedVersion: version.version
          };
        }
        if (!isServerCompatible(version.version)) {
          return {
            ...result,
            reason: "incompatible",
            reportedId: version.id,
            reportedVersion: version.version
          };
        }
        return { ...result, ok: true };
      } catch {
        // Network error, DNS failure, timeout, or non-JSON body — all surface
        // as "unreachable"; the per-server label in the UI names which one.
        return { ...result, reason: "unreachable" };
      }
    })
  );
  return results;
}

/** The editable-host keys, in display order — used by the UI to render
 *  per-server status rows next to the matching input field. */
export const EDITABLE_HOST_KEYS: readonly EditableHostKey[] = SERVERS.map(
  (s) => s.key
);

/** Human-readable server label i18n key for each editable host — the same
 *  `login.*ServerUrl` keys the input fields use, so a status row reuses the
 *  field's label. */
export const HOST_LABEL_KEY: Record<EditableHostKey, string> = {
  API_HOST: "login.syncServerUrl",
  AUTH_HOST: "login.authServerUrl",
  SSE_HOST: "login.sseServerUrl",
  MONOGRAPH_HOST: "login.monographServerUrl"
};