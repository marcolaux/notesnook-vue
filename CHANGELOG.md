# Changelog

All notable changes to **Notesnook Vue Desktop** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.2] - 2026-07-24

### 🌐 System Default Browser External URL Navigation
- **External Link Handling Across Windows**:
  - Added navigation security module (`apps/desktop/src/main/navigation.ts`) that intercepts `setWindowOpenHandler`, `will-navigate`, and `will-frame-navigate` events across all Electron windows (main window, Settings window, note windows, popups, and webviews).
  - Ensured external links (such as release notes links in the Changelog dialog, documentation links in Settings, or external URLs in note content) always open safely in the user's default system web browser (`shell.openExternal`).
  - Preserved internal app navigations (`file:`, `devtools:`, `about:`, dev server) and deep links (`nn://`, `notesnook://`).
- **Navigation Contract Verification**:
  - Added `navigation.spec.ts` contract tests for external URL categorization and deep-link protocol routing.

## [0.4.1] - 2026-07-24

### 🔄 Auto-Updater & UI Error Reporting
- **Updater Dev Mode & Error Reporting**:
  - Added simulated download flow in dev mode and improved error rethrowing for UI update progress and failure notifications in `updaterServer`.
- **Changelog HTML Rendering & Version Gates**:
  - Preserved HTML structure and applied deep element styles for rendered release notes.
  - Strict version check in auto-updater to ensure remote updates are strictly newer than the running app version.

## [0.4.0] - 2026-07-24

### 🖼️ Note List Image & Attachment Thumbnails
- **Image & Attachment Thumbnail Extraction**:
  - Enhanced note list items in `NotesList.vue` to display thumbnail previews for notes containing images or encrypted file attachments.
  - Updated `note-preview.ts` (`extractThumbnail`) to detect `data-hash` and `hash` attributes on attachment-backed `<img>` elements in note content, returning `hash:<hash>` markers.
  - Extended `useNotesStore.loadPreview` in `notes.ts` to resolve `hash:<hash>` thumbnails asynchronously via `db.attachments.read(hash, "base64")` or blob lookup.

### 📎 Attachment File Embed Footers & Utilities
- **Configurable File Embed Footers**:
  - Implemented rich file embed footers in `Editor.vue` supporting inspect, open, and direct download operations for embedded attachments.
  - Added `use-note-footer.ts` composable and `attachments.ts` helpers to manage attachment downloading and blob lifecycle (`toBlobURL`, `revokeBloburl`).
  - Exported `toBlobURL` and `revokeBloburl` helpers from `@notesnook-vue/editor-vue`.

### ✨ Context Menu Wording & Action Consistency
- **Standardized Context Menu Actions**:
  - Unified context menu labels across notes, notebooks, tags, colors, and multi-note selections in `context-menu-entries.ts`.
  - Replaced legacy mixed wording ("Favorite", "Pin to sidebar") with uniform, intuitive labels: **Add to shortcuts** / **Remove from shortcuts** and **Pin to top** / **Unpin from top**.

### 🔄 Auto-Updater & Changelog Rendering Fixes
- **Version Comparison Gate**:
  - Fixed a bug in `updaterServer.check` where `au.checkForUpdates()` returning a release response would mark an update as available even when the remote version (`0.4.0`) matched the running app version (`0.4.0`). `updaterServer.check` now uses `isNewerUpstreamRelease(remoteVersion, currentVersion)` to ensure updates are only flagged as available when the remote version is strictly newer.
- **Changelog Modal HTML Rendering & Deep Styling**:
  - Enhanced `parseMarkdownToHtml` in `markdown.ts` to preserve valid HTML tags (`<h3>`, `<p>`, `<ul>`, `<li>`, `<a>`, `<code>`, etc.) and unescape standalone `<` characters safely without escaping HTML tags into literal text (`&lt;h3&gt;`).
  - Added `.changelog-body` deep CSS element styling in `ChangelogDialog.vue` for headings, paragraphs, lists, code chips, horizontal rules, and links.

### 🧪 Contract Test Suite Expansion
- **Expanded Contract Verification**:
  - Added `markdown.spec.ts` contract suite for testing Markdown & HTML release note parsing.
  - Added `note-footer.spec.ts` contract suite for file embed footer interactions.
  - Extended `note-preview.spec.ts` to verify encrypted attachment thumbnail resolution.
  - Updated `context-menu-entries.spec.ts` for standardized shortcut and pin labels.

## [0.3.1] - 2026-07-24

### 🔄 Auto-Updater Fixes
- **ESM module interop fix for electron-updater**: Fixed a runtime error (`Cannot set properties of undefined (setting 'autoDownload')`) when checking for updates in packaged builds by safely extracting `autoUpdater` from both module namespace and default exports (`mod.autoUpdater ?? mod.default?.autoUpdater`).

## [0.3.0] - 2026-07-24

### 🤖 On-Device AI Vector Search & Hybrid RRF
- **100% On-Device AI Vector Search**: Added hybrid Reciprocal Rank Fusion (RRF) combining vector similarity and lexical FTS5 search with onboarding prompt & changelog modal.

## [0.2.0] - 2026-07-24

### 🗂️ ToC + Minimap Right Sidebar (per-tab)
- **Per-tab ToC/Minimap sidebar**:
  - Added a right-hand sidebar for note tabs with a two-segment header toggle between **Headings** (table of contents) and **Minimap** (VS-Code-style document overview).
  - Visibility is per-tab (`tocVisible`/`tocMode` on `EditorTab`, mirroring `historyVisible`); the legacy global `shell.tocVisible` flag was removed. One `app:toggle-toc` action opens/closes the panel; the ToC↔Minimap mode choice lives in the header.
  - The last-used mode persists as a local-only config preference (`config.tocMode`) and is seeded when a tab opens its sidebar.
- **Unified right-sidebar shell (`RightSidebar.vue`)**:
  - Replaced the flat full-height `border-l` strip with a floating, rounded, heavy-glassmorphism panel shared by both the note-history timeline (`HistorySidebar`) and the ToC/Minimap panel (`TocSidebar`), so the two right-side panels read as one visual family.
- **Heading outline (`TocList.vue` + `use-note-toc.ts`)**:
  - Per-pane heading outline bound to the pane's own note id, so two sidebars in two split panes show two different notes. Clicking a heading scrolls the editor to it.
  - `utils/toc.ts` gained `slugifyText` / `findHeading` to match a ToC id against the live editor DOM (the editor strips heading `id`s on parse, so headings are matched by visible-text slug).
- **Minimap (`NoteMinimap.vue` + `utils/minimap.ts`)**:
  - Rather than cloning the editor HTML (node-views don't mount in a static clone), the minimap walks the live `.ProseMirror` DOM, measures each top-level block, and renders placeholder line-bar glyphs sized to match — an accurate vertical map of what's on screen.
  - Glyphs rebuild on content mutation (`MutationObserver`) and layout resize (`ResizeObserver`), debounced. A viewport slider tracks the editor scroll; click/drag the minimap to scroll the editor. Geometry math is pure in `utils/minimap.ts`.
  - The sidebar reaches the pane's editor DOM through the editor surface registry (`useEditorStore.surfaces`), keyed by tab id, since it is a sibling of the editor.
- **i18n & icons**: Added `toc.*` locale keys and `list` / `map` Lucide icons to the registry.
- **Tests**: Added contract suites for minimap geometry, note ToC, and ToC heading scroll; extended the config, editor-layout, and toggle-commands suites for the new per-tab flags and command.

### 🔄 Auto-Updater Fixes
- **"Check for updates" now resolves to a verdict**: previously a completed check with no update stayed stuck on "Checking for updates…" because the up-to-date snapshot carried `version: null` (indistinguishable from "never checked"). The updater now records the running app version when no update is found, so the UI correctly shows **Up to date** (or **Update available** when a newer release exists) — in both dev (no-op) and packaged builds.
- **Checking on section open**: opening the Updates settings section now triggers an update check immediately, instead of waiting for the boot auto-check.

### 🛠️ Tooling
- Added a flat ESLint config (`eslint.config.mjs`) ignoring vendor / build outputs.

## [0.1.1] - 2026-07-23

### 🎨 Themes & Active Tab Contrast
- **Active Tab & Transparency-Off Light Theme Contrast**:
  - Fixed active tab background when transparency is disabled in light theme to use solid `--background` (pure `#ffffff`), eliminating dark grey background artifacts and aligning with the active theme.
  - Refined `default-light` active tab paper surface to use a clean `var(--background)` 95% opacity mix without dark paragraph tinting.

## [0.1.0] - 2026-07-23

### 🎨 Themes Engine, Design System & Stock Themes Catalog
- **Stock Themes Restoration & Catalog (`@notesnook-vue/theme-vue`)**:
  - Restored Notesnook stock themes with full CSS variable mapping engine and theme preview generator (`preview.ts`).
  - Added `useThemesCatalog` composable and tRPC platform router (`platform/themes-router.ts`, `platform/themes-api.ts`).
  - Implemented `ThemesSection.vue` settings panel with theme cards (`ThemeCard.vue`), details modal (`ThemeDetailsDialog.vue`), and real-time live preview rendering (`ThemePreview.vue`).
- **TailwindCSS v4 & Glassmorphism Design Token Adapter**:
  - Created `@notesnook-vue/theme-vue` workspace package bridging Notesnook stock theme definitions to Tailwind v4 CSS variables (`--color-surface`, `--backdrop-blur-base`, `--nn-surface-opacity`).
  - Added support for dark mode, light mode, and system auto-theme switching with smooth CSS transitions.
- **UI Primitives Library (`@notesnook-vue/ui-vue`)**:
  - Created 7 Tailwind design primitives (`Box`, `Flex`, `Text`, `Button`, `Input`, `Icon`, `Surface`) using `tailwind-merge` class composition and built-in glassmorphism styling recipes.

### ✏️ Rich Text Editor Engine & TipTap Vue 3 NodeViews (`@notesnook-vue/editor-vue`)
- **ProseMirror / TipTap Vue 3 NodeViews**:
  - Replaced 0.0.1 static placeholder editor with a full TipTap Vue 3 rich text editor engine (`@notesnook-vue/editor-vue`).
  - **Task Lists & Task Items**: Built interactive checklist NodeViews (`TaskListNode`, `TaskItemNode`) with dynamic progress calculation, visual indent, task statistics plugin, and checklist progress indicators.
  - **Syntax-Highlighted Code Blocks**: Built `CodeBlock` NodeView powered by Refractor with lazy-loaded language definitions (297 languages supported) and caret/line synchronization.
  - **Resizable Images**: Built `ImageNode` NodeView supporting lazy blob loading (`IntersectionObserver`), aspect-ratio locking resizer handle (`Resizer.vue`), block/inline alignment, and binary data serialization.
  - **Interactive Tables**: Vendored customized `prosemirror-tables` port (`Table`, `TableRow`, `TableCell`, `TableHeader`) with context toolbars for column/row insertion, deletion, cell merging, and property dialogs.
  - **Sandboxed Embeds**: Built `EmbedNode` NodeView for sandboxed iframe embeds with interactive resizers.
  - **Inline Attachments**: Built `AttachmentNode` NodeView for displaying file attachment metadata chips.
- **Formatting Marks & Document Typography**:
  - Added support for Underline (`<u>`), Highlight (`<mark>`), Bold, Italic, Strike, Code, and Links.
  - Implemented full document typography system (`style.css`) under `.ProseMirror` with responsive `clamp()` heading sizes, custom blockquote/HR styles, list counters, and theme-aware selection colors.
- **Command Palette & Slash Commands**:
  - Built VS-Code style Command Palette (`Ctrl/Cmd+Shift+P`) powered by Pinia command registry (`stores/command-palette.ts`).
  - Implemented TipTap Slash Commands (`/`) extension with interactive suggestion menu (`SlashMenu.vue`).
  - Added data-driven Editor Toolbar (`EditorToolbar.vue`) with dynamic active state tracking for marks, nodes, search, ToC, and properties.
- **Internal Note Linking & Autocomplete**:
  - Built custom ProseMirror internal note link TipTap extension (`link/`, `note-link/`) supporting note title matching, link insertion, and scanning.
  - Implemented `NoteLinkPicker.vue` autocomplete suggestion popup for typing internal note mentions (`[[note title]]`).
  - Integrated `note-link-bridge.ts` to handle note ID resolution and navigation to target notes when internal links are clicked in the editor.
  - Added comprehensive contract test suite for note link autocomplete matching, scanning, and insertion (`internal-link.spec.ts`, `note-suggest-trigger.spec.ts`, `note-suggest-match.spec.ts`, `note-suggest-full.spec.ts`).
- **Tag Mention Autocomplete**:
  - Implemented `TagMenu.vue` autocomplete picker and `tag-mention-bridge.ts` for inline `#tag` suggestions in the editor.

### 🖼️ VS-Code Layout Engine, Multi-Pane & Multi-Window
- **Recursive Split-Pane Layout Engine (`stores/editor-layout.ts`)**:
  - Implemented recursive `LayoutNode` tree (`group` / `split`) supporting horizontal and vertical split panes with resizable sashes (`SplitLayout.vue`, `EditorPane.vue`).
- **Per-Pane Tab Management**:
  - Built per-pane tab strips (`NoteTabs.vue`) with Back/Forward history navigation, tab activation, tab closing, tab cycling, and drag-and-drop tab reordering.
- **Tab Tear-off & Standalone Note Windows**:
  - Added tab tear-off capabilities allowing users to drag tabs out into dedicated focus-mode note windows (`main/window-manager.ts`).
  - Implemented cross-window state synchronization via IPC event broadcasting (`app:note-changed`).
- **Settings Window**:
  - Built standalone Settings window (`SettingsView.vue`) operating as an independent Electron window with structured section navigation.

### ⚡ Data Architecture, Encrypted SQLite & Platform Seams
- **Database Engine (`@notesnook/core`) Integration**:
  - Embedded `@notesnook/core` client-side database engine running in the renderer process and communicating with Electron Main via `electron-trpc` IPC bridge.
- **Encrypted SQLite Storage**:
  - Implemented SQLite driver (`platform/sqlite-dialect.ts`, `main/sqlite.ts`) using `better-sqlite3-multiple-ciphers` with AES-256 database encryption.
- **Keychain Security & Key Store**:
  - Integrated Electron `safeStorage` API (`main/safe-storage.ts`, `platform/key-store.ts`) for securely generating, storing, and loading database encryption keys in the OS keychain.
- **Platform Seams**:
  - Implemented `NNStorage` (IndexedDB + libsodium crypto), `FileStorage` (chunked disk storage), and `Compressor` (Node zlib compression).
- **Application State & Multi-Account Switching**:
  - Added `db-locked.ts` contract and application state handlers (`platform/app-state.ts`, `main/app-state.ts`) to support per-account databases, database lock screens, and live user account swapping.

### 🔍 Search, Navigation & Collections
- **Global Search & Viewport Scroll-to-Match**:
  - Added global title-bar search bar (`Ctrl/Cmd+Alt+F`) backed by SQLite FTS5 / BM25 lexical ranking (`db.lookup.notesWithHighlighting`).
  - Added automatic viewport scroll-to-match in Note Editor with multi-stage retry logic.
- **Sidebar & Collections Navigation (`stores/collections.ts`)**:
  - Replaced 0.0.1 static mock links with live sidebar navigation for All Notes, Notebooks, Sub-notebooks (nested hierarchy), Tags, Subtags, Monographs, Archive, and Trash.
  - Supported active collection filtering, pinned items, and trash counter updates.
- **Notes List Filtering, Sorting & Grouping**:
  - Added string and regex search filtering in `NotesList.vue`.
  - Supported calendar date grouping (Today, Yesterday, Earlier this week/month/year).
  - Supported sorting by Title, Created Date, and Modified Date with pinned-first prioritization.
  - Added inline match highlighting (`<mark>`) in title and headline snippet fields.

### ☁️ Cross-Device Auto-Sync, Properties & Monograph Publishing
- **Cross-Device SSE Auto-Sync**:
  - Built Server-Sent Events (SSE) client (`/sse`) listening for `triggerSync` events to auto-trigger background database syncs (`db.sync()`).
- **Note Properties & Metadata Panel (`stores/properties.ts`)**:
  - Built note properties backend & panel managing dates, live word/character/line counts, toggles (pinned, favorite, locked, readonly, localOnly), and tag/notebook assignments.
- **Monograph Web Publishing (`stores/publish.ts`)**:
  - Added monograph publishing integration (`db.monographs`) allowing users to publish notes to public web URLs directly from the properties panel.
- **Note Revision History (`stores/note-history.ts`)**:
  - Built revision history store (`db.noteHistory`) to inspect and restore previous note snapshots.
- **Templates & Unified Tasks View**:
  - Added Note Templates Pinia store (`stores/templates.ts`) and Command Palette insertion commands.
  - Built `TasksView.vue` dedicated router view aggregating checklist items across all user notes.

### 🛡️ Security, Backups & Headless Feature Stores
- **Encrypted Vault Store (`stores/vault.ts`)**:
  - Built headless vault store supporting password-protected encrypted vaults, note locking (`db.vault.add`), and permanent note unlocking.
- **Backup & Restore Store (`stores/backup.ts`)**:
  - Built backup store supporting JSON/file bundle exports (`db.backup.export`) and full/partial backup restoration.
- **Spell-Checker Store (`stores/spell-checker.ts`)**:
  - Integrated Electron session spellcheck capabilities with customizable dictionaries and multi-language support (60+ languages).
- **Headless Stores**:
  - Built `reminders` store (`stores/reminders.ts`), `shortcuts` store (`stores/shortcuts.ts`), and `colors` store (`stores/colors.ts`).

### ⚙️ Release Tooling, Packaging & CI/CD Pipeline
- **Automated Release CLI Tool (`scripts/release-bump.mjs`)**:
  - Created standalone Node.js CLI script for validating working tree cleanliness, updating version strings in `package.json` files, creating git release commits (`chore(release): vX.Y.Z`), tagging releases, and pushing to remote repositories.
- **GitHub Actions Packaging Workflow (`.github/workflows/release.yml`)**:
  - Added automated GitHub Release workflow triggered on `v*` tag pushes.
  - Configured multi-OS matrix publishing unsigned installers for macOS (`arm64` DMG/ZIP), Windows (`nsis`/`portable` EXE), and Linux (`AppImage`).
- **Native SQLite Rebuild Fix (`7d7f10c`)**:
  - Replaced `-o` (`onlyModules`) with `-w` (`extraModules`) in `scripts/rebuild-electron.mjs` for `@electron/rebuild`.
  - Added `projectRootPath` and set `useCache: false` to force ABI rebuilding of `better-sqlite3-multiple-ciphers`, resolving packaged app startup crashes.
- **Node 24 Runtime & GitHub Actions v5 Upgrade (`628cb4a`)**:
  - Upgraded GitHub Actions workflows (`checkout`, `setup-node`, `upload-artifact`) to `@v5` running on Node 24.
  - Shifted CI test matrix from `[20, 22]` to `[22, 24]` and updated `package.json` `engines.node` requirement to `>=22.0.0`.
- **Packaging & Dependency Pruning Fixes (`d2b29b7`, `de63689`, `28b475c`, `ce59396`, `125d16b`)**:
  - Restricted macOS packaging targets to `arm64` only, resolving 1.1 GB architecture duplication.
  - Fixed Spotlight indexing race conditions during macOS DMG creation.
  - Resolved npm workspace bug where `electron-builder` pruned `app-builder-bin` binaries.
  - Added platform-correct `@tailwindcss/oxide` native binding installation step for package builds.
- **Internationalization (i18n) Foundation**:
  - Added `vue-i18n` integration (`i18n/index.ts`) supporting English locale (`en.ts`) and automatic pseudo-locale string wrapping (`toPseudo`).
