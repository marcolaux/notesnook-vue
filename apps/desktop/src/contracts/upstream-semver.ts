/**
 * Upstream-release semver helpers — pure utilities for comparing GitHub
 * release tags against the release we vendored ("developed against"). No
 * Node/Electron imports → unit-testable in isolation, mirroring the rule that
 * pure helpers live in `contracts/` (the main process can't import `@/`).
 *
 * The release we developed against is baked at build time by
 * `scripts/gen-upstream-baseline.mjs` (the newest release tag that is an
 * ancestor of our pinned submodule commit). At runtime the main-process
 * `upstream-checker` fetches the latest release tag from GitHub and uses
 * {@link isNewerUpstreamRelease} to decide whether to notify.
 *
 * Tag shape handled: an optional `v` prefix + `MAJOR.MINOR.PATCH` + an optional
 * `-prerelease` suffix (e.g. `v3.4.4`, `3.4.4`, `v3.4.5-rc.1`, `v3.4.4-beta.1`).
 * Anything that doesn't parse returns `null` and is treated by callers as "not
 * newer" — we never fire an upstream-release notification on a tag we can't
 * reason about.
 */

/** Parsed release tag. `prerelease` is the raw suffix without the leading `-`. */
export interface ParsedReleaseTag {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

const TAG_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** Parse a release tag (`v3.4.4`, `3.4.4`, `v3.4.5-rc.1`). `null` if unparseable. */
export function parseReleaseTag(tag: string): ParsedReleaseTag | null {
  const m = TAG_RE.exec(tag.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? null
  };
}

/**
 * Compare two prerelease suffixes per a semver-ish subset: split on `.`,
 * compare numeric segments numerically and non-numeric segments lexically
 * (numeric < non-numeric, matching semver). Returns -1/0/1.
 */
function comparePrerelease(a: string, b: string): number {
  const sa = a.split(".");
  const sb = b.split(".");
  const len = Math.max(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    const xa = sa[i];
    const xb = sb[i];
    // A missing segment means the shorter one is smaller (1.0 < 1.0.0).
    if (xa === undefined) return -1;
    if (xb === undefined) return 1;
    const na = Number(xa);
    const nb = Number(xb);
    const aIsNum = Number.isFinite(na) && /^[0-9]+$/.test(xa);
    const bIsNum = Number.isFinite(nb) && /^[0-9]+$/.test(xb);
    if (aIsNum && bIsNum) {
      if (na < nb) return -1;
      if (na > nb) return 1;
      continue;
    }
    if (aIsNum) return -1; // numeric < non-numeric
    if (bIsNum) return 1;
    if (xa < xb) return -1;
    if (xa > xb) return 1;
  }
  return 0;
}

/**
 * Compare two release tags by semver ordering. Returns -1 if `a < b`, 0 if
 * equal, 1 if `a > b`. Returns `null` if either tag is unparseable (callers
 * must treat `null` as "not comparable" — see {@link isNewerUpstreamRelease}).
 *
 * A release with a prerelease suffix is *lower* than the same `MAJOR.MINOR.PATCH`
 * without one (e.g. `v3.4.5-rc.1` < `v3.4.5`), per semver.
 */
export function compareReleaseTags(a: string, b: string): number | null {
  const pa = parseReleaseTag(a);
  const pb = parseReleaseTag(b);
  if (!pa || !pb) return null;
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  // Same base version → prerelease ordering. No prerelease > has prerelease.
  if (pa.prerelease === null && pb.prerelease === null) return 0;
  if (pa.prerelease === null) return 1;
  if (pb.prerelease === null) return -1;
  return comparePrerelease(pa.prerelease, pb.prerelease);
}

/**
 * `true` iff `latest` is a newer release tag than `baseline`. Returns `false`
 * for unparseable tags or when they're equal/older — we never notify on
 * garbage or on a tag we can't compare.
 */
export function isNewerUpstreamRelease(latest: string, baseline: string): boolean {
  const cmp = compareReleaseTags(latest, baseline);
  return cmp === null ? false : cmp > 0;
}

/**
 * `true` for a *desktop* stable release tag — `vX.Y.Z` (v-prefix, optional
 * prerelease suffix). Upstream tags desktop releases `v3.4.4` (release name
 * "Notesnook Desktop v3.4.4") and Android releases `3.4.5-android` (no `v`
 * prefix). We track desktop releases only, so the baseline (build-time) and
 * the latest (runtime) come from the same population and stay comparable.
 *
 * `prerelease` mirrors the GitHub release's `prerelease` flag — `true` excludes
 * betas/rcs (`v3.4.0-beta.1`), matching what the runtime considers a "release".
 */
export function isDesktopReleaseTag(tag: string, prerelease: boolean): boolean {
  if (prerelease) return false;
  return /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag.trim());
}

/** Raw shape of a GitHub `/releases` entry (only the fields we read). */
export interface RawGithubRelease {
  tag_name: string;
  prerelease: boolean;
  published_at: string | null;
  html_url: string | null;
}

/** A release selected from the `/releases` list. */
export interface PickedRelease {
  tag: string;
  publishedAt: string | null;
  url: string | null;
}

/**
 * From a GitHub `/releases` page, pick the semver-**newest** desktop-stable
 * release. Pure (no network) — the main bridge fetches the page and hands it
 * here. Returns `null` if the page has no desktop-stable release.
 */
export function pickLatestDesktopRelease(releases: RawGithubRelease[]): PickedRelease | null {
  let best: PickedRelease | null = null;
  for (const r of releases) {
    if (!isDesktopReleaseTag(r.tag_name, r.prerelease)) continue;
    const pick: PickedRelease = {
      tag: r.tag_name,
      publishedAt: r.published_at ?? null,
      url: r.html_url ?? null
    };
    if (best === null || compareReleaseTags(pick.tag, best.tag) === 1) {
      best = pick;
    }
  }
  return best;
}