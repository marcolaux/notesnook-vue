# Changelog

All notable changes to **Notesnook Vue Desktop** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-23

### 🎨 Themes Engine & Stock Themes Catalog
- **Stock Themes Restoration & Catalog (`@notesnook-vue/theme-vue`)**:
  - Restored Notesnook stock themes with full CSS variable mapping engine and theme preview generator (`preview.ts`).
  - Added `useThemesCatalog` composable and tRPC platform router (`platform/themes-router.ts`, `platform/themes-api.ts`).
  - Implemented `ThemesSection.vue` settings panel with theme cards (`ThemeCard.vue`), details modal (`ThemeDetailsDialog.vue`), and real-time live preview rendering (`ThemePreview.vue`).

### 🔗 Internal Note Linking & Autocomplete
- **Internal Note Linking Extension (`@notesnook-vue/editor-vue`)**:
  - Built custom ProseMirror internal note link TipTap extension (`link/`, `note-link/`) supporting note title matching, link insertion, and scanning.
  - Implemented `NoteLinkPicker.vue` autocomplete suggestion popup for typing internal note mentions (`[[note title]]`).
  - Integrated `note-link-bridge.ts` to handle note ID resolution and navigation to target notes when internal links are clicked in the editor.
  - Added comprehensive contract test suite for note link autocomplete matching, scanning, and insertion (`internal-link.spec.ts`, `note-suggest-trigger.spec.ts`, `note-suggest-match.spec.ts`, `note-suggest-full.spec.ts`).

### 📝 Templates & Tasks Aggregator
- **Note Templates System**:
  - Added `templates` Pinia store (`stores/templates.ts`) for managing reusable note content templates.
  - Registered `template-commands.ts` in the Command Palette registry to search and insert templates directly into active notes.
- **Unified Tasks View**:
  - Added `TasksView.vue` dedicated router view that aggregates checklist items and task lists across all user notes into a centralized view.

### 🏷️ Tag Tree & Mention Autocomplete
- **Nested Tag Navigation (`TagNode.vue`)**:
  - Implemented recursive `TagNode.vue` component for displaying hierarchical tag structures in the sidebar.
- **Tag Mention Autocomplete (`TagMenu.vue`, `tag-mention-bridge.ts`)**:
  - Refined tag mention autocomplete picker and bridge for inline `#tag` suggestions in the editor.

### 🔒 Application State & Database Lock Protection
- **App State & DB Lock Contracts**:
  - Added `db-locked.ts` contract and `app-state.ts` platform/preload handlers (`platform/app-state.ts`, `main/app-state.ts`) to manage database lock states and application lifecycle transitions securely.

### ⚙️ Release Tooling & CI/CD Packaging Pipeline
- **Automated Version Bump Tool (`scripts/release-bump.mjs`)**:
  - Created standalone Node.js CLI script for validating working tree cleanliness, updating version strings in root `package.json` and `apps/desktop/package.json`, creating git release commits (`chore(release): vX.Y.Z`), creating git tags, and pushing to remote `origin`.
- **GitHub Actions Release Workflow (`.github/workflows/release.yml`)**:
  - Added automated GitHub Release workflow triggered on `v*` tag pushes.
  - Configured multi-OS matrix publishing unsigned installers for macOS (`arm64` DMG/ZIP), Windows (`nsis`/`portable` EXE), and Linux (`AppImage`).
- **Native SQLite Rebuild Fix (`7d7f10c`)**:
  - Replaced `-o` (`onlyModules`) with `-w` (`extraModules`) in `scripts/rebuild-electron.mjs` for `@electron/rebuild`.
  - Added `projectRootPath` and set `useCache: false` to force ABI rebuilding of `better-sqlite3-multiple-ciphers`, resolving the packaged app startup crash (`Could not locate the bindings file`).
- **Node 24 Runtime & GitHub Actions v5 Upgrade (`628cb4a`)**:
  - Upgraded GitHub Actions (`checkout`, `setup-node`, `upload-artifact`) to `@v5` running on the Node 24 runner runtime.
  - Shifted CI test matrix from `[20, 22]` to `[22, 24]` and updated `package.json` `engines.node` requirement to `>=22.0.0`.
- **`electron-builder` & Dependency Pruning Fixes (`d2b29b7`, `de63689`, `28b475c`, `ce59396`, `125d16b`)**:
  - Restricted macOS packaging targets to `arm64` only, resolving 1.1 GB architecture duplication.
  - Fixed Spotlight indexing race condition during macOS DMG creation.
  - Resolved npm workspace bug where `electron-builder` pruned `app-builder-bin` binaries.
  - Added platform-correct `@tailwindcss/oxide` native binding installation step for package builds.

### 🔍 Global Search & Editor UX
- **Global Title-Bar Search & Scroll-to-Match (`7fce2ec`)**:
  - Title-bar search bar (`Ctrl/Cmd+Alt+F`) backed by SQLite FTS5 / BM25 lexical ranking (`db.lookup.notesWithHighlighting`).
  - Automatic viewport scroll-to-match in Note Editor with multi-stage retry to accommodate async image layout shifts.
  - Search results tab (`kind: "search"`) and existing tab reuse.
- **Cross-Device SSE Auto-Sync (`803bf9e`)**:
  - SSE client connection (`/sse`) using `@microsoft/fetch-event-source` listening for `triggerSync` to auto-trigger `db.sync()`.
- **Nested Sub-Notebooks (`954aac1`)**:
  - Recursive parent-child notebook tree navigation via `db.relations` with depth indentation and collapse toggles.
- **TipTap Vue 3 NodeViews (`editor-vue`)**:
  - Vue 3 NodeViews for tasks, attachments, resizable embed iframes, Refractor syntax-highlighted code blocks (297 languages), resizable images, and interactive tables.
