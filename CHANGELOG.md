# Changelog

All notable changes to **Notesnook Vue Desktop** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-23

### 🚀 Highlights & Changes Since Commit `7d7f10c`
- **Native SQLite Rebuild Fix (`7d7f10c`)**:
  - Replaced `-o` (`onlyModules`) with `-w` (`extraModules`) in `scripts/rebuild-electron.mjs` for `@electron/rebuild`.
  - Added `projectRootPath` and set `useCache: false` to force ABI rebuilding of `better-sqlite3-multiple-ciphers`.
  - Resolved `Could not locate the bindings file` runtime crash in packaged Electron apps.
- **Node 24 Runtime & GitHub Actions v5 Upgrade (`628cb4a`)**:
  - Updated all GitHub Actions workflows (`checkout`, `setup-node`, `upload-artifact`) to `@v5`, running on the Node 24 action runtime.
  - Dropped EOL Node 20 from CI matrix in favor of `[22, 24]`.
  - Upgraded root `package.json` Node engine requirement to `>=22.0.0`.

### 🐛 Packaging & Build Pipeline Fixes
- **macOS Packaging & DMG Stabilization (`d2b29b7`, `de63689`)**:
  - Restricted macOS packaging targets to `arm64` only, resolving 1.1 GB architecture duplication.
  - Mitigated macOS DMG builder flake caused by Spotlight indexing races.
- **`electron-builder` & Dependency Pruning Fixes (`28b475c`, `ce59396`, `125d16b`)**:
  - Fixed npm workspace bug where `electron-builder` pruned `app-builder-bin` binaries.
  - Disabled poisoned npm cache on packaging CI jobs and enforced Node 24 + npm 11 for complete binary extraction.
  - Added platform-correct `@tailwindcss/oxide` native binding installation step for package builds.

### ✨ Features & Renderer UX
- **Global Title-Bar Search & Scroll-to-Match (`7fce2ec`)**:
  - Title-bar search bar (`Ctrl/Cmd+Alt+F`) backed by SQLite FTS5 / BM25 lexical ranking (`db.lookup.notesWithHighlighting`).
  - Automatic viewport scroll-to-match in Note Editor with multi-stage retry to accommodate async image layout shifts.
  - Search results tab (`kind: "search"`) and existing tab reuse.
- **Cross-Device SSE Auto-Sync (`803bf9e`)**:
  - SSE client connection (`/sse`) using `@microsoft/fetch-event-source` listening for `triggerSync` to auto-trigger `db.sync()`.
- **Nested Sub-Notebooks (`954aac1`)**:
  - Recursive parent-child notebook tree navigation via `db.relations` with depth indentation and collapse toggles.
- **Unified Omnibar & Publishing UI (`db0918b`)**:
  - Omnibar modal UI, Monographs publication drawer, collapsible sidebar, and properties panel stats.
- **TipTap Vue 3 NodeViews (`editor-vue`)**:
  - Vue 3 NodeViews for tasks, attachments, resizable embed iframes, Refractor syntax-highlighted code blocks (297 languages), resizable images, and interactive tables.

### ⚙️ Monorepo & Vendor Maintenance
- **Submodule Vendor Security (`3815ecc`)**:
  - Documented upstream bump policy, added drift guards for `@notesnook/*` vendored modules, and untracked scratch files.
- **Documentation Refresh (`b965255`)**:
  - Complete update of `README.md` reflecting architecture, getting started steps, and layout design.
