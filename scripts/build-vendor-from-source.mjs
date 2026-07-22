// @ts-check
/**
 * Build the 5 runtime `@notesnook/*` packages from the `vendor/notesnook`
 * source submodule and refresh `vendor-dist/@notesnook/*` — WITHOUT any
 * patches to upstream.
 *
 * Why this exists (supersedes the copy-from-UPSTREAM flow in `build-vendor.mjs`
 * for the runtime packages): the committed `vendor-dist` was a stale
 * pre-built dist whose `Attachments` subscribed to `fileUploaded`/
 * `fileDownloaded` on the global `EV` while `FileStorage` published on the
 * instance-local `db.eventManager` — so `markAsUploaded` never fired and
 * cross-app image sync broke (papered over by a runtime event-bus bridge).
 * The submodule source already contains the fix (`attachments.ts` uses
 * `db.eventManager`). Building from source picks it up directly.
 *
 * Why NO patches are needed (100% upstream-compatible):
 *  - **FTS5 tokenizers** (`better_trigram` / `html`): the app provides them at
 *    runtime via M4 loadable extensions (`sqlite-better-trigram` +
 *    `sqlite3-fts5-html`, see `apps/desktop/src/main/sqlite.ts`), so core's
 *    unpatched `migrations.ts` runs byte-for-byte upstream. The old
 *    `better_trigram→trigram` / drop-`html` dist shims are gone.
 *  - **`getUpcomingReminderTime` barrel omission**: core exports it from
 *    `collections/reminders` but not from the barrel `index`. Rather than
 *    patch the dist barrel, the build adds a `./collections/reminders`
 *    subpath export to the vendored `package.json` (our wrapper, not
 *    upstream's code) so `packages/contracts` imports the real function.
 *  - **Unused `@notesnook/intl` import** in `core/api/lookup.ts`: `strings` is
 *    imported but never used, so `tsc --noCheck` (ESM/CJS emit) elides it. The
 *    declarations build (`--emitDeclarationOnly`) type-checks and would choke
 *    on the unresolvable module; a build-time type stub in `core/node_modules/
 *    @notesnook/intl` (gitignored scaffolding) lets it resolve + elide the
 *    unused import from the `.d.ts` — matching upstream's dist.
 *
 * Build is pure-local: `tsc --noCheck` (core) + `tsdown` (the other four) + a
 * local `langen` codegen (reads `prismjs`/`refractor`, no network). Native
 * devDeps (`better-sqlite3-multiple-ciphers@11.5.0` etc.) are only needed for
 * core's tests, so `npm install --ignore-scripts` skips their compilation.
 *
 * `editor` + `theme` stay as the committed types-only dists (out of scope —
 * they don't go stale and the fix is core-only). This script leaves them
 * untouched; run the legacy `build-vendor.mjs` against a built UPSTREAM
 * checkout to refresh those on a future bump.
 *
 * Usage: `npm run build:vendor:src`. Re-runnable. Requires `vendor/notesnook`
 * to be checked out (the submodule). The committed `vendor-dist/` stays the
 * canonical artifact for `npm install` / CI / `npm run dev`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SUB = path.join(ROOT, "vendor", "notesnook");
const DEST = path.join(ROOT, "vendor-dist", "@notesnook");

// Topological build order (deps before dependents). `sodium` + `logger` have
// no `@notesnook/*` deps; `crypto` needs `sodium`; `streamable-fs` needs
// `crypto`; `core` needs `logger` (+ the `@notesnook/intl` type stub).
const ORDER = ["sodium", "logger", "crypto", "streamable-fs", "core"];

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

/** Run a command, inheriting stdio, throwing on non-zero exit. */
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false, ...opts });
  if (r.status !== 0)
    throw new Error(`Command failed (${cmd} ${args.join(" ")}) — exit ${r.status}`);
}

/** `pkg` exists at `dir` (built dist present)? */
function exists(p) {
  return fs.existsSync(p);
}

/** Ensure `vendor/notesnook` is checked out + `packages/editor/scripts` is
 *  sparse-checked-out (core's `prebuild` imports `../../editor/scripts/langen.mjs`). */
function ensureSubmodule() {
  if (!exists(path.join(SUB, "package.json")))
    throw new Error(`vendor/notesnook not checked out at ${SUB} — run \`git submodule update --init\`.`);
  if (!exists(path.join(SUB, "packages", "editor", "scripts", "langen.mjs"))) {
    // Idempotent: `sparse-checkout add` is a no-op if already present. This
    // writes to the submodule's `.git/info/sparse-checkout` (local git config,
    // not upstream source) — safe, and re-applied on any fresh clone.
    run("git", ["sparse-checkout", "add", "packages/editor/scripts"], {
      cwd: SUB,
      stdio: "pipe",
    });
  }
}

/** Install a package's deps with `--ignore-scripts` (skips native compile —
 *  the build never runs native code; only tests do). Removes any stale
 *  `@notesnook/*` sibling copies first so a dependent re-copies the freshly
 *  built dist of its deps. */
function installDeps(pkg) {
  const dir = path.join(SUB, "packages", pkg);
  const sibs = path.join(dir, "node_modules", "@notesnook");
  if (exists(sibs)) fs.rmSync(sibs, { recursive: true, force: true });
  run(NPM, ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: dir,
  });
}

/** Build-time type stub for the unused `@notesnook/intl` import in core.
 *  `npm install` resolves core's `@notesnook/intl: file:../intl` dep as a
 *  SYMLINK (`packages/core/node_modules/@notesnook/intl` → `packages/intl`),
 *  so writing the stub through it would overwrite the real source
 *  `packages/intl/package.json` + drop `index.d.ts` into the source tree.
 *  Remove the symlink first and write the stub into a real dir in
 *  (gitignored) `node_modules` — the source `packages/intl` stays pristine. */
function writeIntlStub() {
  const dir = path.join(SUB, "packages", "core", "node_modules", "@notesnook", "intl");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      { name: "@notesnook/intl", version: "0.0.0-stub", types: "./index.d.ts" },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(dir, "index.d.ts"),
    `// Build-time type stub (notesnook-vue build-vendor-from-source). The real\n` +
      `// @notesnook/intl is not built in our sparse checkout; core imports only\n` +
      `// \`strings\`, which is an *unused* import (dead). This stub lets core's\n` +
      `// --emitDeclarationOnly build resolve + type-check so it can elide the\n` +
      `// unused import from the emitted .d.ts — matching upstream's dist (no\n` +
      `// intl reference). Lives in gitignored node_modules — no source/dist\n` +
      `// is patched.\n` +
      `export declare function strings(key: string, ...args: unknown[]): string;\n`
  );
}

/** Install deps, then `npm run build` (the package's own script: `tsdown` for
 *  the four, `tsc`×3 + `langen` prebuild for core). */
function buildPkg(pkg) {
  installDeps(pkg);
  if (pkg === "core") writeIntlStub();
  run(NPM, ["run", "build"], { cwd: path.join(SUB, "packages", pkg) });
}

/** Build the minimal vendored `package.json` — mirrors `build-vendor.mjs`
 *  `makePkg` (type-omission for sodium CJS interop, drop `@notesnook/intl`
 *  from core deps, keep `file:` siblings) + the `./collections/reminders`
 *  subpath export for core. */
function makePkg(pkg) {
  const src = JSON.parse(
    fs.readFileSync(path.join(SUB, "packages", pkg, "package.json"), "utf8")
  );
  /** @type {Record<string, unknown>} */
  const out = { name: src.name, version: src.version, private: true };
  // Mirror source `type` exactly (omit when source omits — see build-vendor).
  if (src.type) out.type = src.type;
  if (src.main) out.main = src.main;
  if (src.module) out.module = src.module;
  if (src.types) out.types = src.types;
  if (src.exports) out.exports = JSON.parse(JSON.stringify(src.exports));
  /** @type {Record<string, string>} */
  const deps = { ...(src.dependencies ?? {}) };
  if (pkg === "core") delete deps["@notesnook/intl"];
  out.dependencies = deps;
  if (pkg === "core") {
    // Expose `getUpcomingReminderTime` (in `collections/reminders` but not the
    // barrel) via a subpath export — contracts imports it from here, no dist
    // barrel patch needed.
    const exp = out.exports || (out.exports = {});
    exp["./collections/reminders"] = {
      require: {
        types: "./dist/types/collections/reminders.d.ts",
        default: "./dist/cjs/collections/reminders.js",
      },
      import: {
        types: "./dist/types/collections/reminders.d.ts",
        default: "./dist/esm/collections/reminders.js",
      },
    };
  }
  return out;
}

/** Copy the built `dist` → `vendor-dist/@notesnook/<pkg>/dist` + write the
 *  minimal `package.json`. Removes the dest `dist` first for a clean refresh.
 *  Strips `*.tsbuildinfo` (tsc incremental-cache files with machine-specific
 *  paths, e.g. the `@notesnook/intl` stub path) — they're never imported, only
 *  bloat the committed `vendor-dist` with non-reproducible content. */
function refreshVendor(pkg) {
  const srcDist = path.join(SUB, "packages", pkg, "dist");
  const dstDir = path.join(DEST, pkg);
  const dstDist = path.join(dstDir, "dist");
  if (!exists(srcDist)) throw new Error(`build produced no dist for ${pkg}`);
  fs.rmSync(dstDist, { recursive: true, force: true });
  fs.cpSync(srcDist, dstDist, { recursive: true });
  // Strip tsc incremental-cache files (machine-specific, never consumed).
  for (const f of findTsbuildinfo(dstDist)) fs.rmSync(f, { force: true });
  fs.writeFileSync(
    path.join(dstDir, "package.json"),
    JSON.stringify(makePkg(pkg), null, 2) + "\n"
  );
  console.log(`✓ @notesnook/${pkg} (built from source)`);
}

/** Recursively collect `*.tsbuildinfo` files under `dir`. */
function findTsbuildinfo(dir) {
  /** @type {string[]} */
  const out = [];
  if (!exists(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...findTsbuildinfo(fp));
    else if (ent.name.endsWith(".tsbuildinfo")) out.push(fp);
  }
  return out;
}

/** Remove the `langen`-generated `languages/index.ts` so the submodule
 *  working tree stays pristine (it's untracked — created by core's prebuild). */
function cleanCoreGenerated() {
  const gen = path.join(
    SUB,
    "packages",
    "core",
    "src",
    "utils",
    "templates",
    "html",
    "languages",
    "index.ts"
  );
  if (exists(gen)) fs.rmSync(gen, { recursive: true, force: true });
}

/** Run the codegen generators `build-vendor.mjs` also runs. */
function runGenerators() {
  run("node", [path.join(ROOT, "scripts", "gen-production-hosts.mjs")], {
    cwd: ROOT,
  });
  try {
    run("node", [path.join(ROOT, "scripts", "gen-upstream-baseline.mjs")], {
      cwd: ROOT,
    });
  } catch {
    // Non-fatal: needs the GitHub API (offline / rate-limited → keep committed file).
    console.warn("  gen-upstream-baseline failed (offline?) — keeping committed file.");
  }
}

/** Restore the submodule's tracked source files that `npm install --ignore-scripts`
 *  dirties (per-package `package-lock.json` updates) so the submodule working
 *  tree is left pristine. `git checkout -- packages/` reverts only tracked
 *  files under `packages/`; `node_modules` is gitignored (untouched) and the
 *  langen-generated `languages/index.ts` is removed by `cleanCoreGenerated`. */
function restoreSubmodule() {
  const r = spawnSync("git", ["checkout", "--", "packages"], { cwd: SUB, stdio: "pipe" });
  if (r.status !== 0)
    console.warn("  warn: could not restore submodule tracked files — check `git -C vendor/notesnook status`.");
  else console.log("  submodule source restored (npm-install lockfile side-effects reverted).");
}

// --- main ----------------------------------------------------------------
console.log(`Submodule: ${SUB}`);
console.log(`Dest:      ${DEST}\n`);
ensureSubmodule();

// Build tools (tsdown/tsc/tsgo) are hoisted at the submodule root. Install if
// missing (idempotent on re-runs).
if (
  !exists(path.join(SUB, "node_modules", ".bin", "tsc")) ||
  !exists(path.join(SUB, "node_modules", ".bin", "tsdown"))
) {
  console.log("Installing submodule root build tools (tsdown/tsc/tsgo)…");
  run(NPM, ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: SUB,
  });
}

for (const pkg of ORDER) {
  console.log(`\n=== building @notesnook/${pkg} ===`);
  buildPkg(pkg);
}

cleanCoreGenerated();
console.log("\n=== refreshing vendor-dist ===");
for (const pkg of ORDER) refreshVendor(pkg);

console.log("\n=== running codegen ===");
runGenerators();

console.log("\n=== restoring submodule ===");
restoreSubmodule();

console.log("\nDone. vendor-dist refreshed from source — zero patches applied to upstream.");