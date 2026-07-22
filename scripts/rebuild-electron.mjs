// Rebuild the native SQLite module (better-sqlite3-multiple-ciphers) for the
// Electron ABI so the packaged app can actually load it at runtime.
//
// Why this exists: `npm ci` installs a prebuild for the *host Node* ABI, but
// the app runs inside Electron (a different module ABI — e.g. Electron 37 =
// v136 vs Node 24/26 = v137/147). Without a rebuild the packaged app dies on
// startup with "Could not locate the bindings file" (it looks for
// `lib/binding/node-v136-…/better_sqlite3.node`, which was never produced).
// electron-builder would normally do this rebuild itself, but we set
// `npmRebuild: false` to dodge the npm-workspaces prune bug
// (electron-builder#7103 — see electron-builder.yml), so we must rebuild
// explicitly beforehand. With the .node pre-rebuilt, electron-builder just
// packages it as-is (asarUnpack keeps it on disk).
//
// Why the version is pinned: @electron/rebuild auto-detects the target
// runtime, but that detection is unreliable when the Electron *binary* isn't
// downloaded (it is for `dev`, but not in a packaging-only / CI install) — it
// then falls back to the host Node ABI and silently ships a non-loadable
// .node. Pinning `electronVersion` to the installed `electron` package makes
// the target deterministic regardless of cwd or Electron-binary state.
//
// The FTS5 tokenizer extensions (sqlite-better-trigram / sqlite3-fts5-html)
// are SQLite *loadable* extensions (.dylib/.so/.dll prebuilds), NOT Node
// addons, so they need no ABI rebuild — only better-sqlite3 does. They're
// skipped automatically (no binding.gyp); `extraModules` just ensures
// better-sqlite3 itself is in the rebuild set.
//
// Run from anywhere (the script resolves the repo root from its own path):
//   node scripts/rebuild-electron.mjs
// Mirrors the `predev` hook (which uses the same rebuild for `electron-vite dev`).
import { rebuild } from '@electron/rebuild';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const require = createRequire(import.meta.url);
const electronVersion = require('electron/package.json').version;

console.log(
  `Rebuilding better-sqlite3-multiple-ciphers for Electron ${electronVersion} ` +
    `(${process.platform}/${process.arch})…`
);

await rebuild({
  // The app project dir (matches `--module-dir apps/desktop`). This is the
  // node_modules tree @electron/rebuild scans for native addons.
  buildPath: path.resolve(root, 'apps/desktop'),
  // The monorepo root (where the top-level package.json lives).
  projectRootPath: root,
  electronVersion,
  arch: process.arch,
  // `extraModules` (the CLI `-w` flag) ensures better-sqlite3 is in the rebuild
  // set. Do NOT use `onlyModules` (CLI `-o`) for this — it filters the
  // auto-detected set by name and silently matched nothing here, making the
  // whole rebuild a 6 ms no-op (the Node-ABI .node from `npm ci` then shipped
  // and the packaged app died with "Could not locate the bindings file").
  extraModules: ['better-sqlite3-multiple-ciphers'],
  force: true,
  // Disable the rebuild cache so this always actually rebuilds (the cache can
  // short-circuit even with `force`, masking a no-op). A few seconds slower;
  // deterministic is what matters for a release artifact.
  useCache: false,
  types: ['prod', 'optional'],
});

console.log('✔ Rebuild complete');