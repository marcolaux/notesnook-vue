#!/usr/bin/env node
/**
 * release-bump — cut a release for the continuous auto-update channel.
 *
 *   npm run release:bump -- patch     # 0.0.1 → 0.0.2
 *   npm run release:bump -- minor     # 0.0.1 → 0.1.0
 *   npm run release:bump -- major     # 0.0.1 → 1.0.0
 *   npm run release:bump -- 1.2.3     # explicit version
 *
 * What it does:
 *   1. Verifies the working tree is clean (so the release commit only carries
 *      the version bump) and that `main` is checked out.
 *   2. Bumps `apps/desktop/package.json` (the version electron-builder reads +
 *      the renderer's `__APP_VERSION__` source) and the root `package.json` to
 *      the same version, preserving formatting (2-space indent, trailing nl).
 *   3. `git add` both files, commits `chore(release): vX.Y.Z`, tags `vX.Y.Z`.
 *   4. Pushes the commit + the tag to `origin`.
 *
 * Pushing the `v*` tag triggers `.github/workflows/release.yml`, which builds +
 * publishes the installers + `latest*.yml` to the GitHub Release for the tag
 * (the version is re-synced from the tag in CI, so the bump here and the CI
 * rewrite agree). Run from the repo root.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const PKG_DESKTOP = "apps/desktop/package.json";
const PKG_ROOT = "package.json";
const MAIN_BRANCH = "main";

function git(args, opts = {}) {
  return execSync(`git ${args}`, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...opts }).trim();
}
function gitInherit(args) {
  execSync(`git ${args}`, { stdio: "inherit" });
}

function fail(msg) {
  console.error(`release-bump: ${msg}`);
  process.exit(1);
}

// --- arg parsing ----------------------------------------------------------
const arg = process.argv[2];
if (!arg) fail("missing bump level — pass `patch`, `minor`, `major`, or an explicit `X.Y.Z`");

const INCREMENTS = ["patch", "minor", "major"];
function bumpVersion(current, level) {
  const parts = current.split(".").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    fail(`current version "${current}" is not semver X.Y.Z`);
  }
  let [major, minor, patch] = parts;
  if (level === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (level === "minor") {
    minor += 1;
    patch = 0;
  } else if (level === "patch") {
    patch += 1;
  } else {
    fail(`unknown bump level "${level}"`);
  }
  return `${major}.${minor}.${patch}`;
}

function readPkg(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
function writePkg(file, pkg) {
  // Preserve 2-space indent + trailing newline (matches the committed files).
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

// --- preflight ------------------------------------------------------------
// Clean working tree — don't bundle unrelated changes into the release commit.
const status = git("status --porcelain");
if (status) fail(`working tree is not clean:\n${status}`);

const branch = git("rev-parse --abbrev-ref HEAD");
if (branch !== MAIN_BRANCH) {
  fail(`not on "${MAIN_BRANCH}" (current branch: "${branch}") — switch to main first`);
}

// --- compute next version -------------------------------------------------
const desktopPkg = readPkg(PKG_DESKTOP);
const current = desktopPkg.version;
const next = INCREMENTS.includes(arg) ? bumpVersion(current, arg) : arg;

// Validate an explicit version arg.
if (!INCREMENTS.includes(arg)) {
  if (!/^\d+\.\d+\.\d+$/.test(arg)) fail(`explicit version "${arg}" is not X.Y.Z`);
  // Reject going backwards or no-op.
  const cmp = [current, next].map((v) => v.split(".").map(Number));
  const [c, n] = cmp;
  const greater = n[0] - c[0] || n[1] - c[1] || n[2] - c[2];
  if (greater <= 0) fail(`next version ${next} must be greater than current ${current}`);
}

// Refuse if the tag already exists (would fail at `git tag` anyway, but fail
// earlier with a clear message before mutating package.json).
try {
  git(`rev-parse -q --verify refs/tags/v${next}`);
  fail(`tag v${next} already exists`);
} catch {
  /* tag does not exist — good */
}

console.log(`release-bump: ${current} → ${next} (${INCREMENTS.includes(arg) ? arg : "explicit"})`);

// --- write + commit + tag -------------------------------------------------
desktopPkg.version = next;
writePkg(PKG_DESKTOP, desktopPkg);

const rootPkg = readPkg(PKG_ROOT);
rootPkg.version = next;
writePkg(PKG_ROOT, rootPkg);

gitInherit(`add ${PKG_DESKTOP} ${PKG_ROOT}`);
gitInherit(`commit -m "chore(release): v${next}"`);
gitInherit(`tag v${next}`);

// --- push commit + tag ----------------------------------------------------
console.log(`release-bump: pushing ${branch} + tag v${next} to origin…`);
gitInherit(`push origin ${branch}`);
gitInherit(`push origin v${next}`);

console.log(`\nrelease-bump: done. v${next} published → release.yml will build + publish.`);
console.log(`  https://github.com/marcolaux/notesnook-vue/actions (watch the Release workflow)`);