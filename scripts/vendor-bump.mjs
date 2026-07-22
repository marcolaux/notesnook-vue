// @ts-check
/**
 * Bump the `vendor/notesnook` submodule to a given upstream release tag (or
 * the latest desktop-stable release) and rebuild `vendor-dist/@notesnook/*`
 * from source in one shot.
 *
 * This is the common-case "track upstream" flow (runbook step A in
 * `docs/updating-vendor.md`): it covers the 5 runtime packages
 * (core/crypto/logger/sodium/streamable-fs) built from the submodule by
 * `build-vendor-from-source.mjs`, plus the codegen generators (production-hosts
 * + upstream-baseline). It does NOT refresh the editor/theme types-only dists
 * — those need a separate built upstream checkout (runbook step B; see
 * `scripts/build-vendor.mjs`). A reminder is printed at the end.
 *
 * Usage:
 *   npm run vendor:bump              # → latest desktop-stable release
 *   npm run vendor:bump -- v3.4.4    # → specific tag
 *   npm run vendor:bump -- latest
 *
 * Leaves the submodule working tree checked out at the target tag (detached
 * HEAD) and `vendor-dist/` + generated `.ts` files refreshed on disk. It does
 * NOT commit — review `git status`, run `npm run test:contract`, then stage +
 * commit per the runbook.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SUB = path.join(ROOT, "vendor", "notesnook");
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

/** Run a command, inheriting stdio, throwing on non-zero exit. */
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false, ...opts });
  if (r.status !== 0)
    throw new Error(`Command failed (${cmd} ${args.join(" ")}) — exit ${r.status}`);
}

/** Capture stdout (trimmed) from a command, throwing on non-zero exit. */
function capture(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", shell: false, ...opts });
  if (r.status !== 0)
    throw new Error(`Command failed (${cmd} ${args.join(" ")}) — exit ${r.status}\n${r.stderr}`);
  return r.stdout.trim();
}

/** `true` for a desktop-stable release tag `vX.Y.Z` (v-prefix, no prerelease). */
function isDesktopReleaseTag(tag) {
  return /^v\d+\.\d+\.\d+$/.test(tag.trim());
}

/** Newest desktop-stable tag in the submodule (sorted desc by version). */
function latestDesktopTag() {
  const out = capture("git", ["tag", "--sort=-v:refname"], { cwd: SUB });
  for (const line of out.split(/\r?\n/)) {
    const tag = line.trim();
    if (tag && isDesktopReleaseTag(tag)) return tag;
  }
  throw new Error("No desktop-stable release tag (vX.Y.Z) found in the submodule.");
}

/** The short SHA + tag the submodule is currently at. */
function currentSubmoduleState() {
  const sha = capture("git", ["-C", SUB, "rev-parse", "HEAD"]);
  const desc = capture("git", ["-C", SUB, "describe", "--tags", "--always"]);
  return { sha, desc };
}

// --- parse args ----------------------------------------------------------
const arg = process.argv[2]?.trim();
const target = !arg || arg === "latest" ? latestDesktopTag() : arg;

console.log(`vendor-bump: target tag = ${target}`);
console.log(`             submodule  = ${SUB}\n`);

if (!fs.existsSync(path.join(SUB, "package.json"))) {
  console.error("vendor-bump: vendor/notesnook not checked out — running `git submodule update --init` first.");
  run("git", ["submodule", "update", "--init", "--recursive"], { cwd: ROOT });
}

// Ensure we have the upstream tags, then check out the target.
console.log("=== fetching upstream tags ===");
run("git", ["fetch", "--tags"], { cwd: SUB });

const before = currentSubmoduleState();
console.log(`=== checking out ${target} in submodule (was ${before.desc} @ ${before.sha.slice(0, 12)}) ===`);
run("git", ["checkout", target], { cwd: SUB });

const after = currentSubmoduleState();
if (after.sha === before.sha) {
  console.log(`\nvendor-bump: submodule already at ${after.desc} (@ ${after.sha.slice(0, 12)}) — nothing to bump.`);
  console.log("             Re-running build:vendor:src anyway to refresh vendor-dist.\n");
}

// Rebuild the 5 runtime packages + codegen from the freshly-pinned source.
console.log("=== building vendor-dist from source (this installs + builds 5 packages; a few minutes) ===");
run(NPM, ["run", "build:vendor:src"], { cwd: ROOT });

console.log("\n=== vendor-dist refreshed ===");
console.log(`  submodule now at: ${after.desc} @ ${after.sha.slice(0, 12)}`);
console.log("\nNext steps:");
console.log("  1. npm run test:contract            # verify compatibility against the new core");
console.log("  2. npm run vendor:check             # confirm dist matches the new pin");
console.log("  3. stage + commit:");
console.log("       git add vendor/notesnook vendor-dist apps/desktop/src/contracts/upstream-baseline.generated.ts apps/desktop/src/contracts/production-hosts.generated.ts");
console.log(`       git commit -m \"chore(vendor): bump @notesnook/* to upstream ${target} (submodule ${after.sha.slice(0, 12)})\"`);
console.log("\n  ⚠ If editor/theme types also changed, run the types-only refresh separately:");
console.log("       UPSTREAM=/path/to/a/built/notesnook-checkout node scripts/build-vendor.mjs");
console.log("\nDone.");