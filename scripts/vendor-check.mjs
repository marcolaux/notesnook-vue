// @ts-check
/**
 * Drift guard: verify the committed `vendor-dist/@notesnook/*` was built from
 * the same commit the `vendor/notesnook` submodule is pinned to.
 *
 * `build-vendor-from-source.mjs` records the submodule HEAD it built from into
 * `vendor-dist/@notesnook/.source-sha`. This script compares that recorded SHA
 * against the submodule gitlink committed in the superproject
 * (`git ls-tree HEAD vendor/notesnook` — works WITHOUT the submodule checked
 * out, so it's CI-friendly: CI never inits `vendor/notesnook`).
 *
 * Mismatch ⇒ the committed dist is stale relative to the pin (submodule bumped
 * but dist not rebuilt, or dist rebuilt from a different commit than
 * committed). This is exactly the hazard that once left a stale `Attachments`
 * dist in tree — see `build-vendor-from-source.mjs` header. Exits non-zero so
 * it can gate CI.
 *
 * Usage: `npm run vendor:check` (or run directly). No network, no build, no
 * submodule checkout required.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SHA_FILE = path.join(ROOT, "vendor-dist", "@notesnook", ".source-sha");

/** Capture stdout (trimmed) from a command, exiting on failure. */
function capture(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", shell: false, ...opts });
  if (r.status !== 0) {
    console.error(`vendor-check: command failed (${cmd} ${args.join(" ")}) — exit ${r.status}`);
    if (r.stderr) console.error(r.stderr);
    process.exit(2);
  }
  return r.stdout.trim();
}

/** The submodule gitlink SHA committed in the superproject (no checkout needed). */
function committedPinSha() {
  const out = capture("git", ["ls-tree", "HEAD", "vendor/notesnook"], { cwd: ROOT });
  // Shape: `160000 commit <40-hex>\tvendor/notesnook`
  const m = out.match(/^[0-9]+\s+commit\s+([0-9a-f]{40})\s/);
  if (!m) {
    console.error("vendor-check: could not parse submodule gitlink from `git ls-tree` output:");
    console.error(`  ${out}`);
    process.exit(2);
  }
  return m[1];
}

if (!fs.existsSync(SHA_FILE)) {
  console.error("vendor-check: vendor-dist/@notesnook/.source-sha is missing.");
  console.error("  The dist was committed before source-SHA recording existed, or the file was removed.");
  console.error("  Rebuild to (re)create it: npm run build:vendor:src   (then commit vendor-dist/@notesnook/.source-sha).");
  process.exit(1);
}

const pinned = committedPinSha();
const recorded = fs.readFileSync(SHA_FILE, "utf8").trim();

if (pinned === recorded) {
  console.log(`vendor-check: OK — vendor-dist source SHA matches submodule pin (${pinned.slice(0, 12)}).`);
  process.exit(0);
}

console.error("vendor-check: DRIFT — committed vendor-dist was NOT built from the pinned submodule commit.");
console.error(`  submodule pin (committed):  ${pinned}`);
console.error(`  dist recorded source SHA:   ${recorded}`);
console.error("");
console.error("  The submodule was moved but vendor-dist was not rebuilt (or vice versa).");
console.error("  Rebuild from the current pin and commit the result:");
console.error("    npm run build:vendor:src");
console.error("    git add vendor-dist vendor/notesnook");
console.error("    git commit -m \"chore(vendor): rebuild vendor-dist from pinned submodule\"");
process.exit(1);