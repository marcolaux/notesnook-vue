// @ts-check
/**
 * Build the vendored `@notesnook/*` dist cluster (Phase: upstream vendor).
 *
 * Copies pre-built `dist` from a full upstream checkout (which has the editor
 * `langen` codegen + native deps + network available — things we can't run
 * inside this repo's install) into `vendor-dist/@notesnook/<pkg>/`, and writes
 * a minimal `package.json` per package so the cluster can be consumed as npm
 * workspaces (ditching the npm `@notesnook/*` packages entirely).
 *
 *   - core / crypto / logger / sodium / streamable-fs: full runtime `dist`.
 *   - editor / theme: **types-only** (`dist/types`) — editor-vue/theme-vue
 *     consume them `import type`-only, so the heavy JS/styles are skipped.
 *   - `intl` / `common` / `ui` are not vendored (unused by this repo).
 *
 * Usage: `UPSTREAM=/path/to/notesnook node scripts/build-vendor.mjs`.
 * Re-runnable (overwrites). Does NOT delete the upstream checkout or run the
 * upstream build — it consumes whatever `dist` already exists there. To
 * refresh, rebuild the upstream checkout (`npm run build` in it) first.
 *
 * The committed `vendor-dist/` is the canonical artifact — `npm install` +
 * `npm run dev` work straight off it. You only need to re-run this script when
 * bumping the upstream submodule: check out the new upstream rev, build its
 * packages (needs the full upstream toolchain — native deps, network, the
 * editor `langen` codegen), then run this with `UPSTREAM` pointing at that
 * checkout. The `vendor/notesnook` submodule is source-only (sparse, no built
 * `dist`), so it can't be used as `UPSTREAM` directly.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
// Default to a sibling upstream checkout if present; else require UPSTREAM.
const DEFAULT_UPSTREAM = path.resolve(ROOT, "..", "notesnook");
const UPSTREAM = process.env.UPSTREAM || (fs.existsSync(path.join(DEFAULT_UPSTREAM, "packages", "core", "dist")) ? DEFAULT_UPSTREAM : undefined);
if (!UPSTREAM) {
  console.error("UPSTREAM env var required: point it at a built notesnook checkout (one with packages/*/dist).");
  process.exit(1);
}
const DEST = path.join(ROOT, "vendor-dist", "@notesnook");

const RUNTIME = ["core", "crypto", "logger", "sodium", "streamable-fs"];
const TYPES_ONLY = ["editor", "theme"];

function cpR(src, dst) {
  fs.cpSync(src, dst, { recursive: true });
}

function readPkg(p) {
  return JSON.parse(fs.readFileSync(path.join(UPSTREAM, "packages", p, "package.json"), "utf8"));
}

/** Build the minimal package.json for a vendored package. */
function makePkg(p, { typesOnly }) {
  const src = readPkg(p);
  /** @type {Record<string, unknown>} */
  const out = {
    name: src.name,
    version: src.version,
    // Mirror the source `type` exactly — do NOT default to "module". The
    // upstream packages ship CJS `.js` + ESM `.mjs` and have NO `type` field
    // (so `.js` resolves as CJS). Defaulting to "module" makes the CJS
    // `browser.js` (sodium) load as native ESM → `exports is not defined in
    // ES module scope`. Omit `type` when the source omits it.
    private: true
  };
  if (src.type) out.type = src.type;
  if (typesOnly) {
    // Types-only: expose `types`, no main/module, no deps (the consumers use
    // these packages `import type`-only, so no runtime or deps are needed).
    out.types = "./dist/types/index.d.ts";
    out.dependencies = {};
  } else {
    // Runtime: keep the source layout (main/module/types/exports) + deps so
    // the dist resolves + its @notesnook/* siblings link via the workspace.
    if (src.main) out.main = src.main;
    if (src.module) out.module = src.module;
    if (src.types) out.types = src.types;
    if (src.exports) out.exports = src.exports;
    /** @type {Record<string, string>} */
    const deps = { ...(src.dependencies ?? {}) };
    // core bundles intl into its dist (intl isn't externalized) — drop the
    // file:../intl dep so npm doesn't try to install the unbundled intl pkg.
    if (p === "core") delete deps["@notesnook/intl"];
    out.dependencies = deps;
  }
  return out;
}

function vendor(p, { typesOnly }) {
  const srcDir = path.join(UPSTREAM, "packages", p);
  const dstDir = path.join(DEST, p);
  if (!fs.existsSync(srcDir)) throw new Error(`upstream package missing: ${p} (looked in ${srcDir})`);
  // Copy dist (types-only → just dist/types).
  const distSrc = typesOnly ? path.join(srcDir, "dist", "types") : path.join(srcDir, "dist");
  const distDst = typesOnly ? path.join(dstDir, "dist", "types") : path.join(dstDir, "dist");
  if (!fs.existsSync(distSrc)) throw new Error(`upstream dist missing: ${p}/dist${typesOnly ? "/types" : ""} (build it in the upstream checkout first)`);
  fs.mkdirSync(path.dirname(distDst), { recursive: true });
  cpR(distSrc, distDst);
  // Write the minimal package.json.
  fs.mkdirSync(dstDir, { recursive: true });
  fs.writeFileSync(path.join(dstDir, "package.json"), JSON.stringify(makePkg(p, { typesOnly }), null, 2) + "\n");
  console.log(`✓ @notesnook/${p}${typesOnly ? " (types-only)" : ""}`);
}

console.log(`Upstream: ${UPSTREAM}`);
console.log(`Dest:    ${DEST}\n`);
for (const p of RUNTIME) vendor(p, { typesOnly: false });
for (const p of TYPES_ONLY) vendor(p, { typesOnly: true });

// Compat shim: our `better-sqlite3-multiple-ciphers` (12.11.1, the node-26-
// compatible build) does NOT register the custom `better_trigram` FTS5
// tokenizer the newer core's migrations use — only upstream's 11.5.0 build
// registers it, and 11.5.0 won't compile on node 26. The standard FTS5
// `trigram` tokenizer (SQLite 3.34+) accepts the same options
// (`remove_diacritics 1`) and is the drop-in replacement. Patch the vendored
// core's dist so db.init() migrations run on our sqlite.
{
  let n = 0;
  /** Recursively patch `.js`/`.mjs` files under `dir`. */
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(fp);
      else if (ent.name.endsWith(".js") || ent.name.endsWith(".mjs")) {
        const src = fs.readFileSync(fp, "utf8");
        if (src.includes("better_trigram")) {
          fs.writeFileSync(fp, src.replaceAll("better_trigram", "trigram"));
          n++;
        }
      }
    }
  }
  walk(path.join(DEST, "core", "dist"));
  console.log(`compat: better_trigram→trigram patched in ${n} core dist file(s)`);
}

// Compat shim 2: the newer core's `content_fts` migration uses a custom `html`
// FTS5 tokenizer (strips HTML before trigram tokenizing) that our
// better-sqlite3-multiple-ciphers 12.11.1 doesn't register (only upstream's
// 11.5.0 fork does, which won't build on node 26). Drop `html` from the
// tokenizer list so the content FTS indexes raw HTML via the standard
// `trigram` tokenizer — search still works (tag text becomes minor noise).
{
  let n = 0;
  function walkHtml(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, ent.name);
      if (ent.isDirectory()) walkHtml(fp);
      else if (ent.name.endsWith(".js") || ent.name.endsWith(".mjs")) {
        const src = fs.readFileSync(fp, "utf8");
        if (src.includes('"html", "trigram"')) {
          fs.writeFileSync(fp, src.replaceAll('"html", "trigram"', '"trigram"'));
          n++;
        }
      }
    }
  }
  walkHtml(path.join(DEST, "core", "dist"));
  console.log(`compat: html tokenizer dropped in ${n} core dist file(s)`);
}

console.log("\nDone. vendored cluster ready in vendor-dist/@notesnook/.");