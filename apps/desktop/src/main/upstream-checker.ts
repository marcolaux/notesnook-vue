/**
 * Main-process upstream-release checker — fetches the latest desktop-stable
 * release of the vendored upstream (`streetwriters/notesnook`) from the GitHub
 * API and compares it against the release we developed against (baked at build
 * time). When a newer release exists, the renderer store surfaces an in-app
 * notification.
 *
 * Mirrors `src/main/updater.ts`: a structural server impl registered via
 * `registerUpstreamCheckerServer` and injected into the tRPC router. Unlike
 * the updater, this needs no `app.isPackaged` gate — a plain `fetch` works in
 * dev and packaged alike — so the module imports nothing from Electron and is
 * unit-testable in Node by stubbing `global.fetch`.
 *
 * Never throws across the bridge: a network failure, rate-limit, or unparseable
 * response is reported as an `error` status with `isNewer: false` (mirrors the
 * updater's "surface as no-update without throwing" stance). The renderer
 * never sees a rejected promise.
 *
 * Rate limiting: unauthenticated GitHub API calls are capped at 60/hour per IP.
 * The renderer throttles to one check per day (see `stores/upstream.ts`), so a
 * single desktop hitting GitHub once a day is nowhere near the limit. A
 * `GITHUB_TOKEN` env var, if present at runtime, is sent as a bearer token to
 * raise the limit (it won't be set in a packaged build).
 */
import { registerUpstreamCheckerServer, type UpstreamCheckerServer, type UpstreamReleaseStatus } from "../contracts/router";
import { UPSTREAM_BASELINE } from "../contracts/upstream-baseline.generated";
import { isNewerUpstreamRelease, pickLatestDesktopRelease, type RawGithubRelease } from "../contracts/upstream-semver";

const API = `https://api.github.com/repos/${UPSTREAM_BASELINE.repo}/releases?per_page=100`;

const TOKEN = process.env.GITHUB_TOKEN;
function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "notesnook-vue-desktop"
  };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

/** Build a status snapshot for the "no latest release / failure" case. */
function failureStatus(error: NonNullable<UpstreamReleaseStatus["error"]>): UpstreamReleaseStatus {
  return {
    checkedAt: new Date().toISOString(),
    baselineTag: UPSTREAM_BASELINE.baselineTag,
    latestTag: null,
    latestPublishedAt: null,
    latestUrl: null,
    isNewer: false,
    error
  };
}

export const upstreamCheckerServer: UpstreamCheckerServer = {
  async check(): Promise<UpstreamReleaseStatus> {
    const checkedAt = new Date().toISOString();
    let res: Response;
    try {
      res = await fetch(API, { headers: headers() });
    } catch {
      // Network / DNS failure (fetch rejects with a TypeError).
      return failureStatus("network");
    }
    if (res.status === 403 || res.status === 429) return failureStatus("rate-limit");
    if (!res.ok) return failureStatus("network");
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return failureStatus("parse");
    }
    if (!Array.isArray(json)) return failureStatus("parse");
    const latest = pickLatestDesktopRelease(json as RawGithubRelease[]);
    if (!latest) return failureStatus("parse");

    return {
      checkedAt,
      baselineTag: UPSTREAM_BASELINE.baselineTag,
      latestTag: latest.tag,
      latestPublishedAt: latest.publishedAt,
      latestUrl: latest.url,
      isNewer: isNewerUpstreamRelease(latest.tag, UPSTREAM_BASELINE.baselineTag),
      error: null
    };
  }
};

/** Register the upstream checker with the tRPC bridge. Called once at main boot. */
export function registerUpstreamChecker(): void {
  registerUpstreamCheckerServer(upstreamCheckerServer);
}