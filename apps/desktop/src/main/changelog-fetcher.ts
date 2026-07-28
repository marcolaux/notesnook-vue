/**
 * Main-process remote changelog fetcher — fetches the raw `CHANGELOG.md` from
 * the app's own GitHub repo (`marcolaux/notesnook-vue`, `main` branch) at
 * runtime so the What's New window can show the *newest* version's release
 * notes. The baked `__CHANGELOG_CONTENT__` only ever contains entries up to the
 * installed version (it's read at build time in `electron.vite.config.ts`), so
 * without this fetch the window is stuck showing the installed version's notes.
 *
 * Mirrors `src/main/upstream-checker.ts`: a structural server impl registered
 * via `registerChangelogFetcherServer` and injected into the tRPC router. Like
 * the upstream checker it needs no `app.isPackaged` gate — a plain `fetch`
 * works in dev and packaged alike — so this module imports nothing from
 * Electron and is unit-testable in Node by stubbing `global.fetch`.
 *
 * Source: `raw.githubusercontent.com` (CDN-served file content) rather than the
 * GitHub Releases API. The repo's `CHANGELOG.md` is the canonical source the
 * renderer already knows how to parse (`formatBundledChangelog`), and raw is
 * not subject to the API's 60/hour unauthenticated rate limit. A
 * `GITHUB_TOKEN` env var, if present at runtime, is sent as a bearer token
 * (harmless for raw; raises limits if GitHub ever routes raw through the API).
 *
 * Never throws across the bridge: a network or parse failure is reported as an
 * `error` status with `text: null` (mirrors the upstream checker's "surface as
 * no-update without throwing" stance). The renderer silently falls back to the
 * baked changelog.
 *
 * Caching: a successful fetch is cached in-memory for ~10 minutes so repeated
 * window opens (and re-focuses) don't re-hit the network. A failure is never
 * cached — the next call retries.
 */
import { registerChangelogFetcherServer, type ChangelogFetcherServer, type RemoteChangelog } from "../contracts/router";

const RAW_URL = "https://raw.githubusercontent.com/marcolaux/notesnook-vue/main/CHANGELOG.md";

const TOKEN = process.env.GITHUB_TOKEN;
function headers(): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": "notesnook-vue-desktop"
  };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

/** Build a failure snapshot (never cached). */
function failure(error: NonNullable<RemoteChangelog["error"]>): RemoteChangelog {
  return { text: null, fetchedAt: new Date().toISOString(), error };
}

// ~10-minute in-memory cache of the last successful fetch. Module-level so it
// survives across window re-opens within one app session.
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { text: string; fetchedAt: string; expiresAt: number } | null = null;

export const changelogFetcherServer: ChangelogFetcherServer = {
  async fetchLatest(): Promise<RemoteChangelog> {
    if (cache && cache.expiresAt > Date.now()) {
      return { text: cache.text, fetchedAt: cache.fetchedAt, error: null };
    }

    let res: Response;
    try {
      res = await fetch(RAW_URL, { headers: headers() });
    } catch {
      // Network / DNS failure (fetch rejects with a TypeError).
      return failure("network");
    }
    if (!res.ok) return failure("network");

    let text: string;
    try {
      text = await res.text();
    } catch {
      return failure("parse");
    }
    if (!text) return failure("parse");

    const fetchedAt = new Date().toISOString();
    cache = { text, fetchedAt, expiresAt: Date.now() + CACHE_TTL_MS };
    return { text, fetchedAt, error: null };
  }
};

/** Register the changelog fetcher with the tRPC bridge. Called once at main boot. */
export function registerChangelogFetcher(): void {
  registerChangelogFetcherServer(changelogFetcherServer);
}