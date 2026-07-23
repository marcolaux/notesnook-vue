// @ts-check
/**
 * Generate `apps/desktop/src/contracts/upstream-baseline.generated.ts` — the
 * release tag we "developed against" — from the pinned `vendor/notesnook`
 * submodule and the upstream GitHub tags.
 *
 * Why: the desktop app notifies the user when upstream (`streetwriters/notesnook`)
 * ships a GitHub release newer than the one our vendored code is based on. To
 * know "the one we developed against" we record, at build time, the **newest
 * release tag that is an ancestor of (or equal to) our pinned submodule
 * commit**. At runtime the app fetches the latest release and compares
 * semver against this baked baseline (see `apps/desktop/src/main/upstream-checker.ts`
 * + `apps/desktop/src/contracts/upstream-semver.ts`).
 *
 * Why "newest ancestor tag" rather than "latest release at build time": if we
 * ever fall behind upstream (our pin predates the latest release), "latest at
 * build time" would record a release we don't actually contain yet and the
 * app would stay quiet about the very releases we're missing. The ancestor
 * approach records the release our code is genuinely based on, so a newer
 * release always fires — and when we bump the submodule + rebuild, the
 * baseline moves forward automatically.
 *
 * The generated file is committed (like `production-hosts.generated.ts` +
 * `vendor-dist/`) so CI (which does NOT init `vendor/notesnook`) and
 * `npm install`/`npm run dev` work without network. Regenerate after every
 * submodule bump — `scripts/build-vendor.mjs` calls this, or run
 * `npm run gen:upstream-baseline` directly.
 *
 * Fails loudly (non-zero) if the submodule isn't checked out, the GitHub API
 * shape changes, or no ancestor release tag can be found — forcing a human
 * look rather than silently emitting a stale/wrong baseline.
 *
 * Usage: `node scripts/gen-upstream-baseline.mjs` (or `npm run gen:upstream-baseline`).
 * Optional: `GITHUB_TOKEN` env raises the unauthenticated 60/hr rate limit.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const _SUBMODULE = path.join(ROOT, "vendor", "notesnook");
const OUT = path.join(ROOT, "apps", "desktop", "src", "contracts", "upstream-baseline.generated.ts");
const REPO = "streetwriters/notesnook";
const API = `https://api.github.com/repos/${REPO}`;

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing — no network, no fs).
// ---------------------------------------------------------------------------

/**
 * Parse the SHA out of a `git submodule status` line. The line is shaped like
 * ` <40-hex> vendor/notesnook (heads/master)` with a status prefix character
 * (` ` clean, `+` modified, `-` not initialised, `U` merge conflict). Returns
 * the 40-hex SHA, or `null` if the line doesn't carry one (e.g. `-` not
 * initialised, or unparseable).
 */
export function parseSubmoduleStatusSha(line) {
  const m = line.trim().match(/^[-+U ]?([0-9a-f]{40})\s+/);
  return m ? m[1] : null;
}

/**
 * Keep only `vX.Y.Z`(-pre) tags and return them sorted **descending** by semver
 * (newest first). Non-semver names (branch names, `latest`, …) are dropped.
 * Sort is stable for equal versions. Exposed for testing.
 */
export function sortSemverTagsDesc(tags) {
  return tags
    .map((t) => ({ t, p: parseParts(t) }))
    .filter((x) => x.p !== null)
    .sort((x, y) => -cmpParts(x.p, y.p))
    .map((x) => x.t);
}

/**
 * Pick the baseline tag: the **newest** tag (already sorted desc) for which
 * `isAncestor(tag)` is true — i.e. the newest release our pinned commit already
 * contains. Returns `null` if none qualify. Pure (the predicate is supplied by
 * the caller, which knows how to answer the ancestor question). Exposed for
 * testing the "first newest ancestor" decision without network.
 */
export function pickBaselineTag(sortedTags, isAncestor) {
  for (const tag of sortedTags) {
    if (isAncestor(tag)) return tag;
  }
  return null;
}

/**
 * `true` for a *desktop* stable release tag — `vX.Y.Z` (v-prefix, optional
 * prerelease suffix), e.g. `v3.4.4`. Excludes Android tags (`3.4.5-android`,
 * no `v`) and prereleases (`v3.4.0-beta.1`). Upstream names desktop releases
 * "Notesnook Desktop vX.Y.Z" and tags them with a `v` prefix; Android uses a
 * bare `X.Y.Z-android` tag. We track desktop releases only — that's what the
 * runtime checker compares against, so the baseline must come from the same
 * population. Mirrors `isDesktopReleaseTag` in
 * `apps/desktop/src/contracts/upstream-semver.ts` (kept in sync by hand; the
 * script stays dependency-free per the `gen-production-hosts.mjs` precedent).
 */
export function isDesktopReleaseTag(tag, prerelease) {
  if (prerelease) return false;
  return /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag.trim());
}

// ---------------------------------------------------------------------------
// Network + git (run only when executed directly — see `main()` guard).
// ---------------------------------------------------------------------------

const TOKEN = process.env.GITHUB_TOKEN;
function authHeaders() {
  const h = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "notesnook-vue-build"
  };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

async function ghJson(urlPath) {
  const res = await fetch(/^https?:/.test(urlPath) ? urlPath : `${API}${urlPath}`, {
    headers: authHeaders()
  });
  if (res.status === 403 || res.status === 429) {
    throw new Error(`GitHub API rate-limited (${res.status}). Set GITHUB_TOKEN to raise the limit.`);
  }
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${urlPath}`);
  return res.json();
}

/** Is `tag` an ancestor of (or equal to) `sha`? Via the compare API. */
async function isAncestorOf(tag, sha) {
  const data = await ghJson(`/compare/${tag}...${sha}`);
  // behind_by = commits in `tag` not in `sha`. 0 ⇒ tag is reachable from sha.
  return Number(data.behind_by) === 0;
}

function readPinnedSha() {
  let line;
  try {
    line = execSync("git submodule status vendor/notesnook", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch (e) {
    console.error("gen-upstream-baseline: `git submodule status` failed:", e.message);
    process.exit(1);
  }
  const sha = parseSubmoduleStatusSha(line);
  if (!sha) {
    console.error(`gen-upstream-baseline: could not parse SHA from submodule status line:`);
    console.error(`  ${line}`);
    console.error("Check out the vendor/notesnook submodule (git submodule update --init) and re-run.");
    process.exit(1);
  }
  return sha;
}

/**
 * Fetch published releases and return the **desktop-stable** ones, sorted
 * newest-first by semver. Each entry carries its `publishedAt` (so the baseline
 * file records it without an extra API call). Mirrors the runtime checker's
 * selection so the baseline and the latest-at-runtime come from the same
 * population (desktop `vX.Y.Z` non-prerelease releases).
 */
async function fetchDesktopReleases() {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const pageReleases = await ghJson(`/releases?per_page=100&page=${page}`);
    for (const r of pageReleases) {
      if (isDesktopReleaseTag(r.tag_name, r.prerelease)) {
        out.push({ tag: r.tag_name, publishedAt: r.published_at ?? null, url: r.html_url ?? null });
      }
    }
    if (pageReleases.length < 100) break;
  }
  return out
    .map((x) => ({ ...x, tag: x.tag }))
    .sort((a, b) => {
      // Reuse the desc comparator by negating an asc compare of parsed parts.
      const pa = parseParts(a.tag);
      const pb = parseParts(b.tag);
      return -cmpParts(pa, pb);
    });
}

// Tiny local semver parts helpers (kept private — the exported sort uses them
// too via closure-free copies to stay self-contained).
function parseParts(t) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(t.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ?? null] : null;
}
function cmpParts(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  const ap = a[3];
  const bp = b[3];
  if (ap === null && bp === null) return 0;
  if (ap === null) return 1;
  if (bp === null) return -1;
  return ap < bp ? -1 : ap > bp ? 1 : 0;
}

async function resolveBaseline(sha) {
  const releases = await fetchDesktopReleases();
  if (releases.length === 0) {
    console.error("gen-upstream-baseline: upstream returned no desktop-stable releases.");
    console.error("Upstream may have restructured tagging — inspect and update this script.");
    process.exit(1);
  }
  const sortedTags = releases.map((r) => r.tag); // already sorted desc above
  const baselineTag = pickBaselineTag(sortedTags, (tag) => isAncestorOf(tag, sha));
  if (!baselineTag) {
    console.error("gen-upstream-baseline: no desktop-stable release is an ancestor of the pinned commit.");
    console.error(`  pinned SHA: ${sha}`);
    console.error("Upstream may have restructured tagging — inspect and update this script.");
    process.exit(1);
  }
  const baseline = releases.find((r) => r.tag === baselineTag);
  return { baselineTag, baselinePublishedAt: baseline?.publishedAt ?? null };
}

function writeFile(sha, baseline, baselinePublishedAt) {
  const body = `/**
 * ⚠️ GENERATED by \`scripts/gen-upstream-baseline.mjs\` — do not edit by hand.
 * Regenerate after every \`vendor/notesnook\` submodule bump:
 *   npm run gen:upstream-baseline   (or \`node scripts/build-vendor.mjs\`)
 *
 * Records the upstream release we "developed against": the newest GitHub
 * release tag that is an ancestor of (or equal to) our pinned submodule
 * commit. The desktop app compares this against the latest release fetched
 * at runtime to decide whether to notify the user of a newer upstream
 * release (see \`apps/desktop/src/main/upstream-checker.ts\`).
 *
 * Committed so CI / \`npm install\` / \`npm run dev\` work without the submodule
 * checked out or network access.
 */
export interface UpstreamBaseline {
  /** GitHub \`owner/repo\` of the vendored upstream. */
  repo: string;
  /** The release tag we developed against (e.g. \`v3.4.4\`). */
  baselineTag: string;
  /** ISO publish time of the baseline release, if known. */
  baselinePublishedAt: string | null;
  /** The pinned \`vendor/notesnook\` submodule commit this baseline was derived from. */
  pinnedSha: string;
}

export const UPSTREAM_BASELINE: UpstreamBaseline = {
  repo: ${JSON.stringify(REPO)},
  baselineTag: ${JSON.stringify(baseline)},
  baselinePublishedAt: ${JSON.stringify(baselinePublishedAt)},
  pinnedSha: ${JSON.stringify(sha)}
};
`;
  fs.writeFileSync(OUT, body, "utf8");
  console.log(`gen-upstream-baseline: wrote ${path.relative(ROOT, OUT)}`);
  console.log(`  baselineTag:        ${baseline}`);
  console.log(`  baselinePublishedAt: ${baselinePublishedAt ?? "(unknown)"}`);
  console.log(`  pinnedSha:          ${sha}`);
}

async function main() {
  const sha = readPinnedSha();
  const { baselineTag, baselinePublishedAt } = await resolveBaseline(sha);
  writeFile(sha, baselineTag, baselinePublishedAt);
}

// Run only when executed directly, not when imported by a test.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("gen-upstream-baseline:", e?.message ?? e);
    process.exit(1);
  });
}