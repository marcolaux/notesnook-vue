# Changelog

All notable changes to **Notesnook Vue Desktop** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2026-07-27

### 🪟 Detach-Pane-into-Window & Tab/Pane Context Menus
- **Detach a whole editor pane into its own window (Phase 4.6)**:
  - Tear an entire pane (a group leaf + all its tabs) out into a standalone Electron window via three entry points: the tab-strip **grip handle** (drag outside the window), a **command palette** action (`app:detach-pane`), and the **`Cmd/Ctrl+Shift+K`** shortcut.
  - Snapshot is transported by `paneId` only (URL) with the full `LayoutSnapshot` held in a main-process in-memory map; the pane window boots the full shell and hydrates via `desktop.window.getPaneSnapshot`, reusing the main-window restore path.
  - Cross-window **move**: dragging the grip onto another app window imports the pane's tabs as a new split sibling (`app:open-pane-at`); dragging outside every window tears off a new pane window — both reuse the existing `resolveTabRelease` geometry.
  - Pane windows own their own session-persistence slot (`ContextSession.paneWindows`) and reopen with their tabs + bounds after quit/relaunch.
  - Reactive-proxy IPC-clone fix: `detachGroupSnapshot` JSON-round-trips the snapshot so Vue reactive proxies structured-clone across Electron IPC.
- **Per-tab context menu** (right-click a tab): Close / Close others / Close tabs to the right / Close all tabs in pane, plus note-only **Copy link to note** (`nn://note/<id>`) and **Open in new window** (single-tab tear-off via `desktop.window.openNote`), and **Detach pane to new window**.
- **Pane context menu** (right-click the empty tab-strip area only — tabs and grip stop propagation): **New note here**, **Split pane right/down**, **Detach pane to new window**, and **Close pane** (when more than one pane exists).
- **Verification**: typecheck (node + web + contracts) clean; 1514 contract tests pass, incl. 15 in `pane-detach.spec.ts`.

## [0.8.0] - 2026-07-26

### 🗺️ Scaled Live DOM Minimap Engine & Responsive Sidebar Layout
- **Scaled Live DOM Minimap Engine**:
  - Replaced inaccurate placeholder line bars with a scaled live clone of the editor's `.ProseMirror` DOM element (`NoteMinimap.vue`).
  - Eliminates fixed line-height assumptions and magic numbers, dynamically computing exact width-fitting scale (`minimapScale`).
  - Preserves 100% visual fidelity matching exact note content (text, line wrapping, syntax-highlighted code blocks, tables, callout borders, blockquotes, checklist items, images, embeds).
  - Real-time updates via `MutationObserver` on editor edits and `ResizeObserver` on layout changes.
- **Dynamic Per-Mode Right Sidebar Resizing**:
  - Updated `EditorPane.vue` to dynamically adjust the right sidebar width based on `activeTab.tocMode`:
    - Headings (ToC) mode: `w-80` (`320px`) for reading outline headings.
    - Minimap mode: `w-40` (`160px`) for a compact vertical minimap strip.
  - Smooth CSS width transitions (`transition-[width] duration-200 ease-in-out`).
  - Header title in `TocSidebar.vue` dynamically displays "Minimap" in minimap mode and "Table of contents" in headings mode.
- **Toolbar Layout & Alignment Polish**:
  - Re-ordered toolbar items in `EditorToolbar.vue`:
    - Left-aligned: Formatting groups, search button, reminder button, and note link picker button.
    - Right-aligned: ToC/Minimap toggle button (`Icon list`), Note History toggle (`Icon history`), autosave status indicator, and publish controls (`ml-auto`).
- **Next Steps & Roadmap**:
  - Phase 6 Vault Unlocking & PGP encryption integration.
  - Canvas-based minimap virtual scrolling optimizations for ultra-long documents (>10,000 lines).

## [0.7.2] - 2026-07-26

### 🛡️ Custom Backup Directory & Release Notes Polish
- **Custom Backup Directory Selection**:
  - Added persistent `backupDirectory` setting in `useConfigStore` and UI in `BackupSection.vue`.
  - Added native folder picker bridge (`selectDirectory` and `saveFileToDir` IPC procedures) so manual and automatic backups save directly to a chosen folder without prompting for location each time.
- **Newest Version Release Notes View**:
  - Updated `ChangelogDialog.vue` and `ChangelogLayout.vue` to compute the target release version tag (`updater.status.version` or latest version in `CHANGELOG.md`).
  - Added `getLatestChangelogVersion()` and version section filtering in `formatBundledChangelog()` (`markdown.ts`) to extract specifically the uninstalled release notes section.
  - Updated `triggerTestChangelog()` in `updater.ts` to simulate the newest version release notes in test mode.
- **Contract Verification Suite**:
  - All typechecks and contract tests passing 100% cleanly.

## [0.7.1] - 2026-07-26

### 🛠️ Bug Fixes & UX Polish
- **Standalone Dedicated Changelog Window**:
  - Replaced in-app overlay with a dedicated singleton `BrowserWindow` (`openChangelogWindow`) reusing OS-native acrylic/vibrancy window chrome.
  - Resolves multi-window duplicate overlay rendering across open windows.
- **Link Note Dropdown Auto-Close**:
  - Registered outside-click, `Escape`, and global `app:close-popups` listeners across inline and toolbar link pickers (`NoteLinkPicker.vue`).
  - Automatically closes note-link popups when switching active notes or creating new notes.
- **Checklist Caret Stability**:
  - Added `inst.isFocused` guard in `reloadIfStale()` (`Editor.vue`).
  - Prevents background HTML re-checks from calling `setContent()` while editing, eliminating caret jumping to the end of the note in checklists.
- **`Cmd+,` Settings Shortcut**:
  - Added `Cmd/Ctrl+,` keydown listener in `useTabShortcuts.ts` and macOS App Menu role in `menu.ts` so opening Settings works reliably when focus is inside the note editor.
- **Cross-Window Note Dragging**:
  - Corrected dragstart screen coordinates in `NotesList.vue` and `NoteTabs.vue` to exact DIP points (`window.screenX + e.clientX`).
  - Fixes cross-window note drag-and-drop tear-off and window tab release on Retina/High-DPI displays.
- **Strict TypeScript & Typecheck Verification**:
  - Merged `DEFAULT_NOTE_LINK_LABELS` in `note-link-bridge.ts` and split `DisplayRow` into `NoteRow` & `BlockRow` discriminated unions in `NoteLinkPicker.vue`.
  - 103 test files and 1,496 contract tests passing 100% cleanly.

## [0.7.0] - 2026-07-26


### 🕸️ Interactive Vector & Semantic Cluster Visualizer
- **Local On-Device Vector Embeddings & Clustering**:
  - Leverages local 384-dimensional vector embeddings (`Xenova/all-MiniLM-L6-v2` stored in SQLite via `sqlite-vec`).
  - Added `getAllNoteCentroidEmbeddings()` in `vector-search.ts` to compute normalized 384-d note centroid vectors.
- **DBSCAN & K-Means Clustering Algorithms**:
  - Implemented **DBSCAN** (Density-Based Spatial Clustering of Applications with Noise) as the default clustering algorithm with dynamic density threshold ($\epsilon$) and `minSamples` controls.
  - Implemented **K-Means** clustering algorithm with k-means++ initialization and configurable cluster count ($K \in [2, 10]$).
- **Hybrid Metadata Vectors for Tags, Notebooks & Colors**:
  - Generates hybrid 384-d vector embeddings for **Tags**, **Notebooks**, and **Colors** by blending note centroid embeddings (70%) with label text embeddings (30%).
  - Groups notes and metadata entities into a unified vector space.
- **2D Dimensionality Reduction (PCA) & Topic Keyword Extraction**:
  - Fast 2-component Principal Component Analysis projecting 384-d vectors to 2D canvas coordinates.
  - Automated TF-IDF topic keyword extraction for cluster labeling (e.g. "Machine Learning", "Design System").
- **Connection Link Types & Visual Filters**:
  - Renders and filters connections by **Semantic Vector Similarity** (cosine threshold slider), **Shared Tags** (dashed lines), **Shared Notebooks**, and **Shared Colors**.
- **Interactive 2D Canvas Workspace & Native Glassmorphism**:
  - High-DPI HTML5 canvas overlay with smooth viewport pan & zoom, stationary screen-space node rendering (constant node dot & text size during zoom), and color-coded cluster boundary hulls.
  - Floating glassmorphism top control bar aligned with Notesnook Vue design system tokens (`bg-glass-surface`, `border-glass-border`, `text-text`).
  - Interactive Node Inspector Side Drawer: Displays selected node, cluster, topic keywords, top 5 semantically similar notes with exact similarity %, associated tags, and direct **"Open Note in Editor"** button.
- **TitleBar Integration & Omnibar Auto-Close**:
  - Added visualizer toggle button (`network` icon) to `TitleBar.vue` next to the Focus Mode toggle button.
  - Disables Sidebar and Focus Mode title bar toggles while the visualizer is open.
  - Automatically closes the visualizer when executing any command or selecting a note/navigation item via the Omnibar.
- **Contract Verification Suite**:
  - 103 test files and 1,496 tests passing cleanly.

## [0.6.1] - 2026-07-26


### 📑 Collapsible Headings (`<h1>` – `<h6>`)
- **Precise Sibling-Based Folding Range Scanning**:
  - Implemented collapsible heading extension in `@notesnook-vue/editor-vue` with `collapsed` attribute (`data-collapsed="true"`).
  - Uses parent sibling block iteration (`parent.child(j)`) in ProseMirror `headingCollapsePlugin` to fold content starting immediately after the heading and stopping precisely before the next heading of the same or higher level (e.g. `siblingLevel <= headingLevel`).
  - Ensures collapsing an `H2` hides only its immediate paragraphs and nested subheadings (`H3`, `H4`), leaving subsequent `H2` headings and their sections 100% visible.
- **Vue NodeView & Hover Fold Chevron**:
  - Rendered `HeadingView.vue` with an inline fold chevron button (`ChevronRight` / `ChevronDown`) and folded indicator badge (`···`).
- **Auto-Expansion Guard on Selection / Search**:
  - Automatically unfolds parent headings when cursor navigation or search-jump (`FindReplace`) lands inside a collapsed section.
- **Commands & Keyboard Shortcut**:
  - Exported `toggleHeadingCollapse`, `collapseHeading`, `expandHeading`, `collapseAllHeadings`, `expandAllHeadings`.
  - Added shortcut `Cmd+Alt+F` to toggle heading collapse at cursor position.
- **Contract Test Verification**:
  - Added `tests/contract/collapsible-headings.spec.ts` covering HTML parsing, commands, sibling level boundary stopping, document-wide folding, and 100% data-preserving roundtrips.

## [0.6.0] - 2026-07-26

### 📊 Comprehensive Table Integration & Manipulation
- **Robust Row & Column Movement Algorithms**:
  - Replaced naive cell-swapping routines (`moveColumnLeft`, `moveColumnRight`, `moveRowUp`, `moveRowDown`) in `actions.ts` with `prosemirror-tables` matrix transformation utilities (`moveRow` and `moveColumn`).
  - Preserves table structure, colspans/rowspans, colwidths, and cell selections during row/column movements without document or cell corruption.
- **Dynamic Floating Toolbars & Selection Positioning**:
  - Enhanced `findSelectedDOMNode` in `prosemirror.ts` to properly resolve target row/cell DOM elements during `CellSelection` and nested inline text selections.
  - Added transaction, window resize, and scroll event listeners to `TableRowToolbar.vue` and `TableColumnToolbar.vue` to keep floating action toolbars smoothly anchored.
- **Full Main Toolbar & Context Menu Integration**:
  - Expanded `tableSettings` conditional menu in `tool-definitions.ts` to expose complete table manipulation options (Insert Row Above/Below, Delete Row, Insert Column Before/After, Delete Column, Merge/Split Cells, Toggle Header Row/Column/Cell, and Delete Table).
  - Re-exported table action helpers directly from `@notesnook-vue/editor-vue`.
- **Contract Verification Suite**:
  - Added comprehensive contract test suite `tests/contract/table-manipulation.spec.ts` covering table insertion, row/column addition/deletion/movement, cell merging/splitting, header toggles, and cell attribute styling.
  - Verified 101/101 test files and 1486/1486 contract tests passing cleanly.

## [0.5.2] - 2026-07-26

### 📝 Inline Note Creation & Space Support in Editor (`[[` / `@`)
- **Inline Create Note Option (`+ Create note "[query]"`)**:
  - Added dynamic create option in `NoteLinkPicker.vue` when typing a note title that doesn't exist yet after `[[` or `@`.
  - Creates the note in the database and inserts the link mark `[[Title]]` at the cursor without swapping active tabs (`openNote: false`).
  - Newly created notes automatically inherit any active Notebook, Tag, or Color filter context.
- **Space Support in Note Queries**:
  - Updated `NoteSuggest` extension configuration to `allowSpaces: true` and updated `findNoteSuggestionMatch` regex to `/(?:@[^@\[\n]*|\[\[[^\]\n]*)/gm`.
  - Enables multi-word title searches and note creation with spaces (e.g. `[[Meeting Notes 2026`) without the picker closing on space.
  - Handled `Escape` key to clear suggestion decoration and outside click to unmount popup.

### 🌐 Web Links, Local File Links & Native File Picker
- **Selection-Aware Text Linking**:
  - Highlight text in the editor -> press `Cmd+K` or click toolbar Link button -> converts highlighted text into a link.
- **Smart Web URL & Local File Detection**:
  - Automatically identifies `http://`, `https://`, `www.` as `🌐 Link to web page "..."`.
  - Automatically identifies `file://`, `/`, `~/`, `C:\` as `📁 Link to local file "..."`.
- **Native OS File Browser ("📁 Browse file…")**:
  - Added **"📁 Browse file…"** button in the link picker using native OS open file dialogs (`desktop.dialog.openFile`).
  - Clicking `file://` links in the editor opens the local file in the OS default application via `desktop.shell.openPath`.
  - Clicking web links opens the system default browser.

### ⌨️ Keyboard Shortcuts for Tab Switching & Editor Actions
- **Tab Cycling & Direct Tab Navigation**:
  - `Ctrl+Tab` / `Cmd+Alt+→` / `Cmd+Shift+]` / `Ctrl+PageDown`: Cycle to Next Tab (`layout.cycleTab(1)`).
  - `Ctrl+Shift+Tab` / `Cmd+Alt+←` / `Cmd+Shift+[` / `Ctrl+PageUp`: Cycle to Previous Tab (`layout.cycleTab(-1)`).
  - `Cmd+1` .. `Cmd+8` / `Ctrl+1` .. `Ctrl+8`: Switch to 1st through 8th tab (`layout.activateTabAtIndex(0..7)`).
  - `Cmd+9` / `Ctrl+9`: Switch to Last Tab (`layout.activateTabAtIndex(-1)`).
  - `Cmd+T` / `Ctrl+T`: Create new note in a new tab (`notes.create()`).
  - `Cmd+K` / `Ctrl+K`: Open Link popover on active editor.
- **Contract Verification**:
  - Extended contract test suite (`notes-tabs-facade.spec.ts`, `note-suggest-full.spec.ts`) with 1475/1475 passing tests.

## [0.5.1] - 2026-07-26

### 🔍 In-Note Search Navigation & Viewport Scroll Restoration
- **Viewport Scroll Centering (`scrollPosIntoView`)**:
  - Added ancestor scroll container lookup and centering function `scrollPosIntoView` in `@notesnook-vue/editor-vue`.
  - Resolved issue where ProseMirror's `tr.scrollIntoView()` target (`.ProseMirror`) had no overflow, leaving off-screen search matches hidden when navigating with `Next`/`Prev`.
- **Match 1 Initial Selection & Cursor-Relative Navigation**:
  - Updated `setFind` to select and center Match 1 as soon as a non-empty search query is entered.
  - Refactored `findNext` and `findPrev` commands to navigate relative to the user's active cursor/text selection position, enabling seamless navigation from any point in the document.
- **Shared Extension Exports & Contract Verification**:
  - Exported `scrollPosIntoView` and `findScrollContainer` from `@notesnook-vue/editor-vue`.
  - Refactored `search-scroll.ts` to consume the shared `scrollPosIntoView` helper.
  - Added contract tests in `find-replace.spec.ts` for relative cursor jumping and ancestor scroll container positioning.

### 🏷️ Footer Tags & Links Keyboard Navigation & Glassmorphism Styling
- **Keyboard Navigation (`ArrowUp`/`ArrowDown`/`Enter`/`Escape`)**:
  - Added keyboard listener and active index tracking (`tagActiveIndex`, `linkActiveIndex`) to footer tag and link inputs in `Editor.vue`.
  - Enabled cycling through tag and link suggestions with `ArrowDown` / `ArrowUp` and selecting active suggestions via `Enter`.
  - Added `Escape` key handling to close suggestion popovers.
  - Synchronized `@mouseenter` hover state with keyboard active indices.
- **Glassmorphism Design Elevation**:
  - Replaced plain dropdown surface with rich glassmorphism popover panels (`bg-surface-solid/95 backdrop-blur-xl border border-glass-border/80 shadow-2xl rounded-xl p-1`).
  - Added active item highlighting (`bg-glass-active text-text font-medium`) and `#` tag prefixing.

### 🎯 Automatic Context Inheritance for Note Creation in Filtered Views
- **Filter-Aware Note Creation (`applyActiveFilterToNote`)**:
  - Implemented `applyActiveFilterToNote(noteId)` in `stores/notes.ts` to inspect the active `collectionFilter` or `collections.selected` context during note creation.
  - Automatically attaches the active **Notebook** (`addToNotebook`), **Tag** (`db.relations.add`), or **Color** (`setColor`) to newly created notes (`create()` and `createDraft()`).
  - Instantly refreshes collection membership so new notes remain visible in `visibleItems` without requiring a manual refresh or view switch.
- **Contract Verification**:
  - Added unit contract tests in `notes-collection-filter.spec.ts` verifying automatic notebook and tag assignment upon note creation in filtered views.

## [0.5.0] - 2026-07-26

### 🧠 Vector Search Engine Optimizations & Metadata Context Enrichment
- **Multi-Field Title Metadata Context Enrichment**:
  - Enhanced `indexNoteEmbeddings` and `queueIndexNoteEmbeddings` in `vector-search.ts` to accept note title metadata.
  - Prepended title metadata to chunk 0 (`${title}\n\n${rawContent}`), enriching vector chunk 0 to boost semantic retrieval accuracy for title-level keywords.
  - Updated `notes.ts` store (`loadPreview` and `saveContent`) to automatically pass note titles to the background vector indexing queue.
- **Background Idle Catch-Up Scanner (`indexUnindexedNotes`)**:
  - Implemented `indexUnindexedNotes()` in `vector-search.ts` to query unindexed notes from the database (`SELECT DISTINCT note_id FROM vec_notes`) and queue them into the embedding pipeline during idle CPU time.
  - Integrated automatic idle scanner scheduling in `bootstrap.ts` after database initialization via `requestIdleCallback`.
- **Contract Test Suite Coverage**:
  - Extended `vector-search.spec.ts` contract tests to verify title metadata chunking and `indexUnindexedNotes` scanner exports.

### 🛠️ Main Process SQLite Regexp Function Registration
- **Custom SQL `regexp` Function**:
  - Registered custom `regexp` function on `better-sqlite3-multiple-ciphers` instance in `apps/desktop/src/main/sqlite.ts` (`this.sqlite.function("regexp", ...)`).
  - Resolved `SqliteError: no such function: regexp` error during `@notesnook/core` database lookup queries.

## [0.4.9] - 2026-07-24

### ✏️ Editor Toolbar, Active Pane Surfaces & Search Scroll Restoration
- **Editor Toolbar Restoration**:
  - Restored missing `<EditorToolbar>` component in `Editor.vue` template, reinstating full text formatting, list, heading, color, link, attachment, ToC, Minimap, and publish controls.
- **Split Pane Active vs Inactive Contrast**:
  - Replaced solid opaque `bg-surface` on `Editor.vue` root container with `bg-transparent`, allowing `EditorPane.vue`'s `.editor-pane-surface` (active focused pane) and `.editor-pane-inactive` (50% dimmed inactive pane) background styling to properly render.
- **Search Result Scroll Target Guard**:
  - Added cancellation token `cancelRestoreScroll()` and pending-target checks in `Editor.vue` and `omnibar.ts` so `restoreScrollPosition()` timers do not overwrite global search match scroll positions.
  - Omitted `userId` from `installTheme` tRPC query payload when unauthenticated to prevent theme server catalog errors.

## [0.4.7] - 2026-07-24

### 📜 Editor Scroll Position Persistence Across Tabs & Notes
- **Per-Tab & Per-Note Scroll Memory**:
  - Added `scrollTop?: number` to `EditorTab` contracts (`session-state.ts`) and editor layout store (`editor-layout.ts`).
  - Added per-note scroll position tracking (`noteScrollPositions`) so scroll position is preserved when switching tabs, navigating between notes, or re-opening notes.
- **DOM Detachment & Reflow Protection**:
  - Implemented `lastKnownScrollTop` tracking in `Editor.vue` to prevent browser DOM false-zero reads when `<KeepAlive>` detaches inactive tab elements.
  - Implemented multi-frame reflow restoration (`nextTick`, `requestAnimationFrame`, and delayed frame passes) with `isRestoringScroll` loopback guards to ensure flexbox reflow and image rendering don't reset `scrollTop`.
  - Wired eager scroll saving into `onNoteChange`, `onDeactivated`, and `onBeforeUnmount`.
- **Contract Verification**:
  - Added unit test suite in `editor-layout.spec.ts` for per-tab and per-note scroll position memory.

### 🖼️ Lazy Loading for Notes List Entries & Image Thumbnails
- **Viewport-Driven Lazy Loading**:
  - Implemented `v-lazy-preview` custom directive in `NotesList.vue` using native `IntersectionObserver` with a `150px` root margin.
  - Previews, checklist progress bars, and attachment thumbnails (`hash:<hash>` -> base64/blob URL) are now requested on-demand only as note entries scroll into view.
- **Optimized Boot & Mutex Protection**:
  - Updated `notes.load()` in `notes.ts` to eagerly pre-fetch previews for only the top 15 visible notes on list initialization, eliminating SQLite IPC mutex saturation and `DOMParser` thread jank for off-screen notes.

### 🎨 Theme Store & API Request Navigation Security Fix
- **Service Host Exemption**:
  - Fixed an issue where `themes-api.notesnook.com` calls in `ThemesSection.vue` and `useThemesCatalog` failed due to navigation security intercepting network requests as external browser open events.
  - Added `INTERNAL_SERVICE_HOSTS` exemption in `navigation.ts` covering `themes-api.notesnook.com`, `api.notesnook.com`, `auth.streetwriters.co`, `events.streetwriters.co`, `subscriptions.streetwriters.co`, `issues.streetwriters.co`, and `monogr.ph`.
- **Main Frame Guard**:
  - Updated `will-frame-navigate` listener to enforce `event.isMainFrame` checks, preventing background API requests or sub-resource fetches from being blocked.
- **Contract Verification**:
  - Updated `navigation.spec.ts` contract tests to verify service hosts are identified as internal non-external URLs.

## [0.4.6] - 2026-07-24

### 🛠️ Vite Build Resolution Fix for Bundled Changelog
- Injected `__CHANGELOG_CONTENT__` global constant via Vite `define` in `electron.vite.config.ts` using Node `readFileSync(resolve(__dirname, "../../CHANGELOG.md"))`.
- Fixed Vite renderer build resolution error when referencing files outside `src/renderer` root.

## [0.4.5] - 2026-07-24

### ⚡ Vector Search Typing Lag Elimination & Smart Activity Deferral
- **User Activity Guard & Deferral**:
  - Implemented active user interaction tracking (`recordUserActivity`, `isUserRecentlyActive`) in `vector-search.ts` to suspend background embedding generation while the user is actively typing or interacting with the app.
  - Extended background indexing debounce timer during active editing to 10 seconds, eliminating main-thread typing stutter.
- **Per-Chunk Incremental Embedding Reuse**:
  - Optimized `indexNoteEmbeddings` to perform per-chunk diffing, reusing existing embeddings for unchanged paragraphs in `vec_notes` rather than deleting and re-computing all chunks on minor edits.
- **Time-Slicing & Yielding**:
  - Added 30ms frame yields between chunk computations to guarantee the main JS UI thread remains fluid and responsive (60fps typing).
- **Flush-on-Blur Hook**:
  - Added `flushVectorIndexQueue()` called on editor unmount and tab deactivation to flush pending index queues when leaving an edited note.
- **Contract Verification**:
  - Added contract tests in `vector-search.spec.ts` for activity tracking and queue deferral.

## [0.4.4] - 2026-07-24

### 📄 Dynamic In-App Changelog Embedding & Status Badge Fix
- **Live Bundled Release Notes**:
  - Dynamically embedded root `CHANGELOG.md` via Vite `?raw` import in `ChangelogDialog.vue`, replacing outdated hardcoded release notes.
  - Added `formatBundledChangelog` in `markdown.ts` to strip root headers so in-app "View Changelog" modal displays live release notes starting with the running version (`v0.4.4`).
- **Accurate Version Status Badge**:
  - Fixed `openChangelog()` in `updater.ts` so opening the dialog when up-to-date displays an accurate **Up to Date** status badge instead of incorrectly marking **Update Available**.
- **Contract Verification**:
  - Added unit test coverage in `markdown.spec.ts` for raw changelog header formatting.

## [0.4.3] - 2026-07-24

### 🔐 Self-Hosted 2FA Email Trigger & Login UX Enhancements
- **Automatic 2FA Code Dispatch**:
  - Fixed an issue where logging into a self-hosted (or official) Notesnook instance with email or SMS 2FA enabled did not trigger sending the 2FA verification code email/SMS.
  - Updated `useAuthStore.login` to automatically invoke `db.mfa.sendCode(primaryMethod)` when `primaryMethod` is `"email"` or `"sms"`.
- **Resend Code & Method Switching**:
  - Added `resendMfaCode` and `switchMfaMethod` actions to `useAuthStore`.
  - Added a **Resend code** button and secondary MFA method switcher (e.g. switching between Authenticator App and Email verification) in `LoginScreen.vue`.
  - Improved MFA step guidance and status feedback in `LoginScreen.vue`.
- **Auth Contract Verification**:
  - Extended `auth.spec.ts` contract tests to cover email 2FA code dispatch, code resending, and method switching.

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
