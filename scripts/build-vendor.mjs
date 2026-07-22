// @ts-check
/**
 * Refresh the **types-only** vendored `@notesnook/*` packages (`editor`,
 * `theme`) from a full upstream checkout, and re-run the codegen generators.
 *
 * The 5 runtime packages (`core`, `crypto`, `logger`, `sodium`,
 * `streamable-fs`) are NO LONGER handled here — they are built from the
 * `vendor/notesnook` source submodule by `scripts/build-vendor-from-source.mjs`
 * (`npm run build:vendor:src`), which produces a byte-for-byte-upstream dist
 * with **zero patches** (the FTS5 tokenizers are provided at runtime via the
 * M4 loadable extensions in `apps/desktop/src/main/sqlite.ts`; the
 * `getUpcomingReminderTime` barrel omission is handled by a subpath export on
 * the vendored `package.json`). The old `better_trigram→trigram` / drop-`html`
 * / barrel-re-export dist shims are gone — they were a stopgap for never
 * finishing M4, not a necessity.
 *
 * `editor` + `theme` stay **types-only** here: editor-vue/theme-vue consume
 * them `import type`-only, so the heavy JS/styles are skipped. They are not
 * built from source by us (that needs the editor `langen` codegen + toolchain),
 * so this script copies their pre-built `dist/types` from a full upstream
 * checkout. `intl` / `common` / `ui` are not vendored (unused by this repo).
 *
 * Usage: `UPSTREAM=/path/to/notesnook node scripts/build-vendor.mjs`.
 * Re-runnable (overwrites). Does NOT run the upstream build — it consumes
 * whatever `dist` already exists there. To refresh, rebuild the upstream
 * checkout (`npm run build` in it) first.
 *
 * The committed `vendor-dist/` is the canonical artifact — `npm install` +
 * `npm run dev` work straight off it. You only need to re-run this script when
 * bumping the upstream submodule's editor/theme types.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
// Default to a sibling upstream checkout if present; else require UPSTREAM.
const DEFAULT_UPSTREAM = path.resolve(ROOT, "..", "notesnook");
const UPSTREAM = process.env.UPSTREAM || (fs.existsSync(path.join(DEFAULT_UPSTREAM, "packages", "editor", "dist")) ? DEFAULT_UPSTREAM : undefined);
if (!UPSTREAM) {
  console.error("UPSTREAM env var required: point it at a built notesnook checkout (one with packages/editor/dist + packages/theme/dist).");
  process.exit(1);
}
const DEST = path.join(ROOT, "vendor-dist", "@notesnook");

const TYPES_ONLY = ["editor", "theme"];

function cpR(src, dst) {
  fs.cpSync(src, dst, { recursive: true });
}

function readPkg(p) {
  return JSON.parse(fs.readFileSync(path.join(UPSTREAM, "packages", p, "package.json"), "utf8"));
}

/** Build the minimal types-only `package.json` for a vendored package. */
function makePkg(p) {
  const src = readPkg(p);
  /** @type {Record<string, unknown>} */
  const out = {
    name: src.name,
    version: src.version,
    // Mirror the source `type` exactly (consistency; these packages ship no
    // `type`, so the vendored copy omits it too).
    private: true
  };
  if (src.type) out.type = src.type;
  // Types-only: expose `types`, no main/module, no deps (consumers use these
  // packages `import type`-only, so no runtime or deps are needed).
  out.types = "./dist/types/index.d.ts";
  out.dependencies = {};
  return out;
}

function vendor(p) {
  const srcDir = path.join(UPSTREAM, "packages", p);
  const dstDir = path.join(DEST, p);
  if (!fs.existsSync(srcDir)) throw new Error(`upstream package missing: ${p} (looked in ${srcDir})`);
  // Copy dist/types only.
  const distSrc = path.join(srcDir, "dist", "types");
  const distDst = path.join(dstDir, "dist", "types");
  if (!fs.existsSync(distSrc)) throw new Error(`upstream dist missing: ${p}/dist/types (build it in the upstream checkout first)`);
  fs.mkdirSync(path.dirname(distDst), { recursive: true });
  cpR(distSrc, distDst);
  // Write the minimal package.json.
  fs.mkdirSync(dstDir, { recursive: true });
  fs.writeFileSync(path.join(dstDir, "package.json"), JSON.stringify(makePkg(p), null, 2) + "\n");
  console.log(`✓ @notesnook/${p} (types-only)`);
}

console.log(`Upstream: ${UPSTREAM}`);
console.log(`Dest:    ${DEST}\n`);
console.log("Runtime packages (core/crypto/logger/sodium/streamable-fs) are built from source — run `npm run build:vendor:src`.\n");
for (const p of TYPES_ONLY) vendor(p);

// Regenerate the production-hosts constant from the upstream `hosts` source so
// the "Notesnook (default)" login profile stays in sync with upstream after a
// bump (see scripts/gen-production-hosts.mjs for why). Reads the committed
// submodule source, not UPSTREAM, so it runs even without a built checkout.
{
  const r = spawnSync(process.execPath, [path.join(__dirname, "gen-production-hosts.mjs")], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("gen-production-hosts.mjs failed — see output above");
}

// Regenerate the upstream-release baseline (the newest desktop-stable release
// tag that is an ancestor of our pinned submodule commit) so the in-app
// "newer upstream release" notifier stays in sync after a bump. Fetches from
// the GitHub API, so it needs network — unlike gen-production-hosts it is
// NON-fatal here: if offline (or rate-limited) we warn and keep the committed
// generated file, which stays valid until the next bump. Re-run
// `npm run gen:upstream-baseline` when online to refresh it.
{
  const r = spawnSync(process.execPath, [path.join(__dirname, "gen-upstream-baseline.mjs")], { stdio: "inherit" });
  if (r.status !== 0) {
    console.warn("gen-upstream-baseline.mjs failed (offline / rate-limited?) — keeping the committed baseline. Re-run `npm run gen:upstream-baseline` when online.");
  }
}

console.log("\nDone. types-only vendored packages refreshed in vendor-dist/@notesnook/.");