# Changelog

All notable changes to **Notesnook Vue Desktop** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### ✨ Drag a list item into any other list in the document
List items could only be reordered within their own list tree — drag one across a divider (or any non-list block) into a separate list and the drop was silently swallowed. The same-tree confinement is gone: a list item can now be dropped into **any** list anywhere in the note, across the blocks between lists. When the target list is a different type, the dragged item is **converted** to the target's item type so it joins seamlessly — a bullet/outline item dropped into a task/checklist becomes a flat `indent`-ed row (and a flat indented group dropped into a bullet/outline list rebuilds as a real-nested tree); `checked` is preserved within the flat family and dropped when crossing into a real-nesting type. Bullet ↔ ordered share `listItem`, so no conversion happens there. Same-type drags keep the existing behaviour (indented sub-items still move as a group, sibling drops re-level to any depth). Conversion is lossy by design for exotic content. Wired in `list-drag-reorder/`; 4 new cross-tree/cross-type contract tests, 22 pass.

### ✨ Republish a published note + copy its public URL on publish
An already-published note can now be **updated** in place: a new "Update published note" command (palette, shown only when the active note is published) and an Update item at the top of the editor-toolbar Published submenu reopen the publish dialog seeded for an edit (title prefilled, self-destruct from the persisted Monograph row, password empty with a leave-blank-to-keep hint). On confirm it re-runs `db.monographs.publish`, which core treats as a PATCH because the note is already published — pushing the latest content to the existing public page. After any successful publish the note's public URL is copied to the clipboard (best-effort, never throws) so it can be shared immediately. `stores/publish.ts` exposes the monograph's `selfDestruct` to seed the toggle; `refresh-cw` icon added to the static set. 28 publish contract tests pass.

### ✨ Paste as plain text — context menu + Cmd/Ctrl+Shift+V
A "Paste as plain text" entry in the editor right-click menu and the `Cmd/Ctrl+Shift+V` shortcut (focused pane only) paste the clipboard's `text/plain` representation as literal text nodes — never parsed as HTML — with newlines converted to hardBreak nodes so multi-line paste keeps line breaks without carrying source formatting, links, or structure. Clipboard-read failures are swallowed. Building text nodes rather than passing a bare string is load-bearing (`insertContent("<b>x</b>")` would otherwise parse the string as HTML). Wired in `use-editor-context-menu.ts` + `Editor.vue`; `editor-context-menu.spec.ts` updated.

### ✨ Strikethrough promoted to the top-level toolbar
Strikethrough moved out of the "more formatting" submenu to the top-level toolbar row (next to bold/italic/underline), so the common strike-through toggle is one click instead of two. `DEFAULT_TOOLBAR` updated.

### ✨ Omnibar field now hints at the search shortcut too
The omnibar pill in the title bar already showed a `⌘K` / `Ctrl+K` hint for the command palette, but the other global opener — `⌘⌥F` (macOS) / `Ctrl+Alt+F` (elsewhere), which drops you into notes-search mode (the field's default) — was undiscoverable. The field now shows **both** shortcut badges on the right while empty: the search binding first, then the command binding (matching the adjacent `⋯` palette button). Both hide as soon as you type so they never overlap the query. Wired in `GlobalSearchInput.vue`; the hotkeys themselves are unchanged (registered in `TitleBar.vue`).

### 🐛 Omnibar dropdown dropped the first result of every search tier
Typing a query that matched exactly **one** note (e.g. `bug` → the *NNVue Bugs* note) showed nothing in the omnibar dropdown, even though the full Search Results tab found it. The dropdown's tier-grouping loop captured the "current group" reference *before* creating a new group, so the first item of each tier (Exact / Semantic / Cluster) was never added to its group — and with a single result the only item was dropped, leaving a lone section header with zero rows. With semantic search on the symptom was stranger: a semantic hit landed under the **Exact** header (it was pushed into the previous tier's group) while the real exact match vanished. Fixed in `OmnibarDropdown.vue` by reassigning the group reference to the newly-created group before pushing the item. The Search Results page used a separate, correct grouping path, which is why it always showed the note.

### 🐛 Semantic-search toggle now persists in the Settings window
Disabling **Semantic Vector Search** in Settings → Search for an account appeared not to stick: the toggle showed ON again on reopen. The Settings window bootstraps its own renderer, and the settings store's `semanticSearchEnabled` ref was seeded at construction (before `bootstrap()` resolved the account context from `?ctx=`), so it read `LOCAL_CONTEXT`'s value for the whole session while the toggle *wrote* to the account's key. The main window already re-seeds these per-account client prefs via `loadClientPrefs()` after bootstrap; the Settings window boot branch now does the same. (The search path itself read the account key fresh on every query, so a disable did take effect at search time — only the Settings *UI* displayed the wrong value.)

### 🔧 Removed the bilingual keyword glossary
Dropped the small hardcoded German↔English term map (KI↔AI, Speicher↔storage, …) from the keyword-suggestion path. It was redundant with the multilingual `granite-embedding` model, which handles cross-language matching generally (any language, any term) via the semantic path — the curated single-token list was an incomplete, surprising special case. The keyword path is now literal-only (typing "AI" still suggests `AI/Hermes` + `AI/Claude`; typing German "KI" is matched semantically, not via a hand-maintained mapping).

## [0.17.0] - 2026-07-31

### ✨ Proactive notebook / tag / color suggestions while you write
When you're writing a note that has no notebook, tag, or color yet, a floating glass bar appears below the editor toolbar offering one-click suggestions derived from your existing notes — so organizing a new note takes a single click instead of remembering to do it later. Dismiss it and it stays hidden for that note until you've added ~40 more words; assign any one of notebook/tag/color and it closes. The bar also surfaces the most similar notes it found, each clickable to open in this pane or to link into the current note.

- **Three signals, merged.** (1) **Semantic** — the note text is embedded and matched against your indexed notes (vector KNN); the notebooks/tags/colors of the most similar ones are aggregated with a relative-to-top confidence gate (weak signal → no bar). (2) **Lexical FTS5 fallback** when semantic search is off. (3) **Direct keyword** — the text is scanned for existing tag/notebook names, so typing "AI" suggests the `AI/Hermes` + `AI/Claude` tags and "NAS" suggests `NAS`; this bypasses the confidence gate (a literal name hit is a strong signal). Tags match on any `/`-segment; notebooks match the full title as a phrase.
- **Related notes (Open / Link).** The top similar notes are shown as chips regardless of the confidence gate — click the title to open in this pane, click the link icon to link the current note to it.
- **Multilingual embeddings.** Replaced the English-only `all-MiniLM-L6-v2` with `granite-embedding-97m-multilingual-r2` (384-dim — same `vec_notes` schema, int8 ~94 MB, CLS pooling) so German (and 200+ languages) get real semantic matches instead of falling back to the commonest notebook/tag. A one-time re-index (purge + re-queue) runs automatically when the model changes — on boot, and when semantic search is enabled mid-session.
- **Bilingual glossary.** A small German↔English term map (KI↔AI, Speicher↔storage, Datenbank↔database, …) lets the keyword path bridge languages for single-token tag names.
- **Per-pane + non-intrusive.** One controller per editor pane (split panes are independent); inference runs in the existing Web Worker so typing stays fluid; re-runs are debounced after a typing pause and refresh the chips as content grows (an empty re-run never clears the bar — only dismiss/assign closes it). The overlay is a floating, rounded glass pill that fades in from the top, with a pinned close button (always visible even when the chip list overflows) and wheel→horizontal-scroll like the toolbar/tabs. New `utils/note-similarity.ts`, `composables/use-note-suggestions.ts`, `components/NoteSuggestions.vue`, `utils/embedding-model.ts`; color added to `useNoteFooter`; `sparkles`/`file-text`/`link` added to the static icon set. Typecheck clean; 22 new contract tests.

### 🚪 Sign out now actually signs you out (forgets the account on this device)
Clicking **Sign out of this account** ("Abmelden") in the sidebar account switcher did not really log you out — it only live-swapped the window to the local database and cleared the local-mode skip flag. The account's auth token (in its encrypted SQLite DB's KV), its `databaseKey` + `userEncryptionKey` in the OS keychain, its DB file, and its `accounts.json` registry entry all survived untouched, so re-selecting the account from the switcher or the login-screen chips silently re-entered the shell via `switchToAccount` → `finalize()` → `db.user.getUser()` — no password, no MFA. Sign out now forgets the account on this device and revokes the refresh token server-side: reusing it requires a fresh "Add account" + password login (notes re-sync from the server).

- **`auth.logout()` is now destructive + server-revoking** (`stores/auth.ts`). For the current (account) context it: revokes the refresh token server-side → `switchContext(LOCAL)` → drops the `accounts.json` registry entry → clears the keychain secrets → closes + deletes the account's encrypted SQLite file → drops the per-context IndexedDB → sets the logged-out state. The account disappears from the switcher and login-screen chips. This is the active-account counterpart of `removeAccount()` (which handles non-active accounts without server-side revoke).
- **GOTCHA — revoke via `db.tokenManager.revokeToken()`, not `db.user.logout()`.** `db.user.logout(true)` runs an in-place `db.reset()` (core `user-manager.ts:266`) that leaves the account SQLite connection mid-reset; the subsequent `deleteContextDb` then hung on that connection, the cleanup never completed, and the renderer stayed stranded on the reset account DB — so login after sign-out hung at "please wait" until a manual refresh. `tokenManager.revokeToken()` (a public field, `api/index.ts:199`) deletes the local `token` KV + POSTs to the auth server's logout endpoint *without* `db.reset()`; the file deletion disposes the whole DB anyway, so a reset was redundant.
- **Every destructive step is bounded by `withTimeout`** (new module-level helper in `auth.ts`): a slow/unreachable auth server or a stuck IPC call can never block the local cleanup, and a late rejection is swallowed so it isn't reported as unhandled. The registry entry is dropped *first* so the account disappears from the UI even if file/keychain deletion is slow.
- **Contract test** (`tests/contract/auth.spec.ts`): the "logout → ..." test now asserts `tokenManager.revokeToken` is called (and `db.user.logout` is not), plus the registry/keychain/file cleanup. New `vi.mock` stubs for `@/platform/key-store`, `@/platform/account-registry`, and `@/platform/desktop-bridge` (the destructive IPC the bridge-absent vitest can't reach). 23 contract tests pass; typecheck clean.

### 🧭 Omnibar / nav buttons no longer shift when a badge appears
The omnibar pill and the back/forward nav buttons now stay centered at a fixed position in the title bar regardless of whether the indexing, update, or upstream-release badge is showing on the right. Previously the title bar was a plain flex row — `[left toggles] [omnibar flex-1] [badge cluster]` — and the omnibar was centered only *within the space left over* after the badge cluster took its share, so any badge appearing/disappearing widened/narrowed the cluster, shrank the omnibar's `flex-1` slot, and shifted the centered `[back][fwd][pill]` group left or right.

- **Fixed in `TitleBar.vue`**: the right-side badge cluster is taken out of the flex flow — absolutely positioned, pinned to the right edge of the title bar (with `right` mirroring the title bar's right padding so it still clears the Windows/Linux window-control overlay buttons). The row gains `relative` to become the positioning context. The omnibar's `flex-1` slot now always spans the full content width, so its centered group never moves. Trade-off: on very narrow windows the centered pill's empty right flank could sit under a badge, but it never overlaps the nav buttons (which hug the pill's left side) — acceptable since the whole point is that the omnibar must not move.

### ◀️ Global back / forward navigation next to the omnibar
The title bar now has **back / forward** arrows hugging the left side of the omnibar pill — a browser-style workspace history that walks a single per-window stack across *every* navigation surface, not just within one tab. Switching tabs, opening a note in a new tab, jumping from All Notes to Daily Notes, following an inline note link, picking an omnibar result, and closing a note are all steps on one timeline; back/forward walks it regardless of which surface the navigation crossed. So: switch tabs → back returns to the previous tab; open a note in a new tab → back returns to the tab you had open; All Notes → Daily Notes → back returns to All Notes; close a note → back reopens it. Reaches the palette (`app:go-back` / `app:go-forward`) and the keyboard (`⌘/Ctrl+[` / `⌘/Ctrl+]`).

- **New `stores/nav-history.ts`** — a global, per-window, in-memory stack of restorable `NavTarget` snapshots (`route` + `collection` + `tasksFilterActive` + `dailyDate` + focused `groupId` + active `tab`). This is *not* the dormant per-tab `EditorTab.history`/`historyIndex` plumbing in the editor-layout store (which was never populated and stayed length-1; it's left intact since the contract tests exercise it). The per-tab steppers were the wrong layer — they can't span tabs, views, or closes.
- **`groupId`/`tabId` are hints, `noteId`/`attachment.hash`/`searchQuery` are durable.** Tabs/panes go stale on close/re-home, so the dedup *identity* excludes `groupId`/`tabId` — including them would make a stale-groupId restore push and truncate the forward stack. `restore()` falls back to the durable key (reopening a closed note via `openNote(noteId)`) and normalises the resolved ids back into the entry, so back/forward through a closed note or a re-homed pane doesn't lose the forward branch.
- **Capture is rAF-deferred.** The watcher on the seven navigation signals (route, `collectionFilter`, `collections.selected`, `activeGroupId`, `activeTabId`, `tasksFilterActive`, `daily.selectedDate`) pushes once per animation frame after the state settles. Without this, navigating to `/tasks` from a notebook would record a dud intermediate entry (route changed but the Tasks view's `onMounted` filter-clear hadn't run yet) that restored to the same place — forcing two back presses. `goToCollection` additionally wraps its `await filterByCollection` + `router.push` in a `beginBatch`/`endBatch` so a slow DB fetch can't split one click into two entries.
- **`validateTarget` handles stale references.** A trashed/deleted note (no longer in `notes.items`) drops the tab step (back skips it, leaving the current tab in place); a deleted collection falls back to `/all` clean. The stack is cleared on account/context switch (`notes.resetView` → `nav.clear()`) so back never reopens a foreign account's note.
- **`tasksFilterActive` + `dailyDate` are explicit capture fields** (not derived from the route) so restore is route-aware and the Tasks/Daily `onMounted` hooks stay idempotent — no flash, exact dedup.
- **UI**: the two buttons live inside `GlobalSearchInput.vue`'s centered row so the `[back][fwd][pill]` group centers together and the arrows hug the pill's left; disabled when there's nothing to walk. `arrow-left`/`arrow-right` were added to the *static* icon-registry set (they were lazy-only and would have popped in after the first paint). i18n `titlebar.navBack`/`navForward` added (en + de; pseudo auto-derived). Shortcuts wired in `use-tab-shortcuts.ts` (`⌘/Ctrl+[` / `]` — the no-shift chords; `⌘/Ctrl+Shift+[` / `]` remain prev/next-tab cycling).
- **Scope (v1).** Split-pane *geometry* is not restored (a bare split focuses a new empty pane, which records a useful "back restores pre-split focus" entry; `moveTab`/`reorder`/`resize`/`collapse` dedup to no entry since the same note stays active). The stack is in-memory and resets on restart (boot lands on `/all` anyway). Verified: typecheck (web+node), build, and 1934 contract tests pass; the dev boot log is clean (no errors).

### 🗑️ Move to trash from the tab context menu
Right-clicking an editor tab now offers **Move to trash** (note tabs only), alongside the existing Close / Close others / Close right / Close all entries. The action confirms first (same dialog as the notes-list row menu) then trashes the note — and since `notes.moveToTrash` closes every open tab for that note as part of trashing, no separate close is needed (the same single-call behavior the `app:close-tab-and-trash` palette command relies on).

- **Wired in `NoteTabs.vue`'s `onTabContextMenu`** inside the note-tab branch: a `danger` item reusing the existing `archive.moveToTrash` / `contextMenu.moveToTrashSingle` i18n keys and the `trash-2` icon, gated on `tab.kind === "note" && tab.noteId`. The `useDialogStore` confirm is added to the component; the entry sits after the copy-link / open-in-new-window note actions, before the pane-level detach entry. Attachment and search-only tabs are unaffected.

### ⌨️ ArrowDown in the title moves focus into the editor
Pressing ArrowDown while the caret is in the note title field now moves focus into the editor body (at the start of the first paragraph), instead of doing nothing. The title is a single-line input where ArrowDown has no native target, so it now mirrors the existing Enter behavior (which already focused the editor). Only ArrowDown is added — all other keys in the title behave as before.

- **Wired in `Editor.vue`** alongside `onTitleEnter`: a new `onTitleArrowDown` calls the same `editor.chain().focus().setTextSelection(1).run()` and is bound via `@keydown.arrow-down.prevent` on the title `<input>`.

### 🏠 Opening Local in a new window no longer flashes the login screen
Switching to local mode via the account switcher's "Open in new window ▸ Local" sometimes showed the login screen instead of the editor shell — intermittently, not every time. Local mode's single login gate is the `skippedLogin` flag, mirrored to two stores: renderer `localStorage` (written synchronously, shared across same-origin windows) and the main-process `userData/app-state.json` (the durable mirror, written fire-and-forget via an async IPC). On boot `auth.init()` reconciled the two by letting the main-side value **unconditionally override** the localStorage value. But the localStorage write lands instantly while the main mirror's `setAppState(true)` IPC only lands in main's event loop whenever it can — and creating a `BrowserWindow` keeps main busy — so the freshly-opened local window could read the correct `true` from localStorage at construction, then have `getAppState()` return a stale `false` from main (the pending `setAppState(true)` still in flight, or silently lost since `setAppState` swallows IPC errors). That override flipped `effectiveShowShell` from `true → false`, the `App.vue` watch navigated to `/login`, and the login screen rendered after the boot overlay lifted.

- **Main now only restores, never clobbers** (`stores/auth.ts`, `auth.init()`): the reconciliation is a union — `skippedLogin = localSkipped || saved.skippedLogin`. The durable-restore case the override was written for (a lost localStorage reading `false`, main holding the persisted `true`) still wins; the reverse divergence (localStorage `true`, main stale `false`) now keeps the fast/local value instead of clobbering it. Both-false still yields `false`. This is also immune to a persistently-stale main left by a silently-failed `setAppState`.
- **In-place switch unaffected.** The account switcher's in-place "Local" (`switchToAccount`) sets `skippedLogin` synchronously in the same window and never re-reads main, so it never had the bug; only the new-window path reconstructed the flag from durable storage.

### 📝 Creating headings works again (slash menu, toolbar, markdown `#`)
Headings could not be created by any of the three entry points: the slash menu's "Heading 1/2/3" inserted only a new line, the toolbar's "Headings" dropdown did nothing, and typing `# `/`## `/… + space (the markdown shortcut) didn't turn the line into a heading. All heading levels were affected. The cause was a wiring gap in the custom heading node: `Editor.vue` disables StarterKit's heading in favor of the project's own collapsible `Heading` extension, but that custom extension re-implemented only the collapse behavior (node view, `toggleHeadingCollapse`, collapse plugin) and never re-added the standard heading-creation commands, the `# ` input rule, or the `Mod-Alt-1..6` level shortcuts that StarterKit's heading had provided. So `toggleHeading`/`setHeading` resolved to no-ops — the slash menu's prior `/query`-range deletion was the only edit that actually applied, leaving the empty line.

- **Restored in `packages/editor-vue/src/extensions/heading/heading.ts`**, mirroring `@tiptap/extension-heading`: `setHeading`/`toggleHeading` commands (via `setNode` / `toggleNode(..., "paragraph", ...)`), `addInputRules` with `textblockTypeInputRule` for `^(#{1,level})\s$` per level, and `Mod-Alt-1..6` keyboard shortcuts (merged with the existing `Mod-Alt-f` collapse toggle). A `heading` command-group type augmentation is added (it merges cleanly with the one from `@tiptap/extension-heading`).
- **Collapse features untouched** — `toggleHeadingCollapse`, `collapseHeading`/`expandHeading`, `collapseAllHeadings`/`expandAllHeadings`, the node view, and the collapse plugin are unchanged; the new `collapsed` attribute keeps its `false` default when a heading is created via any of the restored paths.

### ⌨️ Escape from the omnibar restores editor focus
Pressing Escape after focusing the omnibar via search (⌘/Ctrl+⌥F) or the command palette (⌘/Ctrl+K, ⌘/Ctrl+⇧P) now returns the caret to the editor that had focus before the omnibar opened, instead of leaving focus on the omnibar field (blurred to `<body>`). The focused pane's editor is captured at open time — only when the editor's ProseMirror surface held DOM focus right before the omnibar stole it — so opening the omnibar from a non-editor surface (the notes list, an attachment tab, the `⋯` button clicked while the list had focus) does nothing on Escape, preserving the previous behavior. The capture is cleared whenever the omnibar closes so a stale editor reference never survives into the next session. This mirrors the existing capture-and-refocus pattern used by the editor context menu's assignment submenus.

### 🔎 Rebuild lexical search index — fixes title search for older notes
Lexical search (FTS5) could miss words that appear only in the **title** of notes created before the search index was populated, while body search still worked. The `notes_fts` table (titles) was never backfilled for those existing notes — the `a-2025-06-04` migration's `rebuildSearchIndex` didn't run cleanly for an already-existing database — and the FTS triggers only index *new* title writes, so older notes' titles stayed absent from `notes_fts` while `content_fts` (bodies) was populated. New notes were unaffected (triggers index them live); this repaired the pre-existing ones.

- **One action, two entry points.** `db.lookup.rebuild()` (core's `rebuildSearchIndex` — delete-all + reinsert both FTS tables in one transaction; idempotent) is wired through a shared `rebuildSearchIndexWithConfirm()` util that both the new `app:rebuild-search-index` palette command and the Search settings section call — confirm dialog → rebuild → done/error dialog. Run it once to repair the DB.
- **Search settings: Index Maintenance.** The Search & Retrieval settings section now has an "Index Maintenance" area with two clearly-labeled, color-badged cards so the two independent indices are unambiguous: **Lexical Index (FTS5)** — `Titles • Body • Exact matches` → Rebuild (this fix; does not touch the vector index); **Vector Index (Semantic)** — `Embeddings • Meaning • On-device` → Purge vector storage (the pre-existing `purgeVectorIndex`, now clearly scoped). A help line explains when to use each.
- **The FTS path itself was correct.** Verified end-to-end against a real `better-sqlite3-multiple-ciphers` DB with the `better_trigram`/`html` tokenizer extensions via 8 new contract tests (`tests/contract/search-title-fts.spec.ts`) — title-only matches, case-insensitivity (`"quarterly"` → title `"Quarterly Review"`), titleless-then-titled (trigger reindex), title-update reindex, both `lookup.notes` + `notesWithHighlighting` (the omnibar's Exact tier). There were previously **zero** E2E title-search tests (the omnibar contract test mocks `db.lookup`). One test reproduces the stale state (empties `notes_fts`, confirms title search fails + body search still works) then confirms `db.lookup.rebuild()` restores it.
- i18n `command.rebuildSearchIndex` + `searchIndex.*` + `settings.search.{maintLexicalTitle,maintLexicalBadges,rebuildLexical,rebuildLexicalDesc,maintVectorTitle,maintVectorBadges,maintHelp,purgeTitle}` added (en + de).

## [0.16.0] - 2026-07-30

### 🗂️ References as cards in the editor footer
The editor footer now shows a note's references as rich cards — title, tags as pills, and an excerpt — replacing the former title-only backlink chips and the separate daily-notes references panel. Backlinks (notes linking to the current note) appear as cards for every note; for a daily note (or a no-note date reached from the timeline) the day's tasks, created, and modified notes are listed too — tasks as task rows (the checklist block, not the whole note), created/modified as cards. Clicking a card opens the note in the same pane; right-click shows the standard note context menu.

- **One footer section, no separate panel.** The deleted `DailyNotesPanel.vue` (a per-editor panel mounted below the footer) and the title-only incoming chips are replaced by a single `EditorReferences.vue` section inside the editor's scroll area, per-pane.
- **Cards via `ReferenceCard.vue`** — title (+ pinned/favorite glyphs), `#tag` pills, a 2-line excerpt from the note `headline`, and a subtle color tint when the note has an assigned color. Backlinks are enriched to card data by joining the in-memory `notes.items` list (a trashed/archived backlink degrades to a title-only card).
- **Daily references ported from the panel** — tasks read the daily store's aggregated `taskRefsByDate` scan (counts still match the timeline dots); created/modified are in-memory `notes.items` filters by `dayRange`. The section always renders for a selected date (empty groups show "None"), so clicking a timeline date surfaces the day's references even before a daily note exists.
- **No contract change** — `use-note-footer.ts`'s `incoming` stays `NoteLinkRef[]` (enrichment is a view-layer join), so the footer/links contract tests and the note-link/tag-mention bridges are untouched. i18n `editor.references` / `editor.backlinks` added (en + de).

### 🔎 Tiered, categorized search results (Exact → Semantic → Cluster)
Global search now shows results in three labeled, priority-ordered categories instead of one blended list: **Exact** (FTS5/BM25 word matches) first, then **Semantic** (vector similarity over the embeddings already indexed), then **Cluster** (notes related to the query via k-means clusters of note centroids). A note appears in the first tier it matches — lower tiers exclude anything already shown above — so exact word hits always win. Both the omnibar dropdown and the full-page Search Results tab render the three tiers as sticky-header sections.

- **Replaces Reciprocal Rank Fusion.** The former RRF blend fused FTS5 + vector KNN into one flat list and discarded which source each hit came from. The omnibar store now keeps a `TieredSearchResults { exact, semantic, cluster }` shape; `results`/`resultsCache`/`loadResults`/`bumpCache` all carry it (the Search Results tab reads the cache *reactively* so the async cluster tier fades in live).
- **Cluster tier is new but built on existing infra** (`utils/vector-search-clusters.ts`): it reuses the k-means + per-note-centroid scan that already powered the Vector Visualizer, adds an in-memory cache so the full-vector scan + `runKMeans` don't run per keystroke, and is **blended** — it unions the cluster whose centroid is nearest the query with the clusters the top Exact/Semantic hits belong to, then ranks the remainder by cosine similarity to the query. `k` scales with corpus size (`clamp(round(√n), 3, 12)`).
- **Lazy + cached + async**: Exact + Semantic render instantly; the Cluster tier is kicked off in the background and appears once built, never blocking typing. The cache is invalidated on every index mutation (edit / add / delete) via a dynamic import (a static import would cycle: the cluster module imports `getAllNoteCentroidEmbeddings` back from `vector-search.ts`), and a build invalidated mid-flight is discarded so a stale clustering is never committed.
- **One embedding per query**: a new `searchVectorEmbeddingsByVector(queryVec, limit)` (extracted from `searchVectorEmbeddings`) lets the Semantic KNN and the Cluster tier share a single `computeEmbedding` call.
- **Cleaned up the vector-only result hack**: Semantic/Cluster rows (no FTS highlights) are now built as proper `HighlightedResult`s (`toHighlightedResult`) instead of the former `as unknown as HighlightedResult` cast that attached non-standard `body`/`note` fields.
- **Dropdown nav preserved**: rows are grouped by tier with sticky section headers (the `NotesList` pattern), but keyboard nav stays flat-indexed via each group's `start` offset — `is-active`/pick/hover address the store's flat `items` coordinate space unchanged.
- i18n `omnibar.tierExact` / `tierSemantic` / `tierCluster` / `tierClusterLoading` added (en + de). When semantic search is disabled, only the Exact tier shows (Cluster needs embeddings too). Contract tests (`tests/contract/omnibar.spec.ts`) updated to the tiered shape.

### 🔄 Open note now refreshes after a cross-device sync
A note open in the editor now updates live when a sync from another device changes it — including the editor you're actively viewing, not just background split panes. Previously `reloadIfStale()` bailed whenever the editor had focus, so the focused (active) pane kept stale content after a sync even though background panes refreshed. The `isFocused` early-bail is removed; a clean focused editor now reloads. Unsaved local edits are still never clobbered — the skip-if-dirty gate blocks a reload while typing is pending, and a new post-`await` check aborts a reload that was mid-flight (loading content from the DB) when the user started typing. `setContent(…, false)` fires no `onUpdate`, so a reload can't mark the note dirty or re-broadcast (no feedback loop). The same change lets a KeepAlive-reactivated tab show remote edits made while it was hidden.

### 🖱️ List drag-to-reorder (all list types, group move + drop marker)
List items can now be dragged to reorder them, moving an indented parent and its sub-items as a group with a visible drop marker — across every list type (rich task list, simple checklist, collapsible bullet/ordered, outline). All list types share one vertical 3-band interaction, so they behave identically.

- **One interaction for all list types** — three vertical drop zones on the row under the pointer: top 35% = sibling before the row, bottom 35% = sibling after the row's subtree, middle 30% = nest as the row's child. **Outdent** by dropping the child onto a shallower row (one gesture to any depth — a level-4 child to level 1 by dropping it on the top-level row); **indent** by dropping on a deeper row; same row reorders. This unified model replaced an earlier horizontal "drag left to outdent" geometry for real-nesting lists, whose narrow X band made same-depth reorders silently no-op.
- **Two indent models, one group concept** (`extensions/list-drag-reorder/`): flat checklists (`taskItem`/`checkListItem`, visual `data-indent` siblings) grab the row plus its following higher-indent siblings; real-nesting lists (`listItem`/`outlineListItem`) grab the single item node (its nested subtree rides along). Sibling drops re-`indent` checklist rows to the target's level (`rebuildChecklistGroup`, relative structure preserved); real-nesting lets the insert list set the depth (`realNestingDropTarget`).
- **Tree confinement** (`topLevelListPos`): drops are confined to the same top-level list tree, so a nested item can move between the levels of one list but not leap to an unrelated list. **Bug fixed:** this function returned the *innermost* list ancestor instead of the *outermost*, so every cross-level drop was rejected — `dragstart` fired but `drop` was always a no-op, i.e. a child couldn't be moved anywhere. Fixed to return the outermost, and now unit-tested (it wasn't before, which is why the bug slipped through).
- **Stable DOM-overlay marker, not a ProseMirror decoration** — a `position: fixed` line/rectangle appended to `document.body`, positioned on `dragover` with no transaction dispatched mid-drag (a decoration's 2px widget shifted `posAtCoords` → a flicker feedback loop). Removed before the drop transaction. StarterKit's `dropcursor` is disabled so its black caret doesn't draw a second line on top.
- Bullet/ordered/outline items are now `draggable` with a hover-revealed `⠿` grip in the left gutter (`data-drag-handle`); checklist items already had one. The plugin is registered after the list node extensions so its `handleDrop` precedes the attachments-bridge. Multi-row checklist groups get an "N items" drag-image pill.
- Tests: `tests/contract/list-drag-reorder.spec.ts` (23) covers the pure move logic — `realNestingDropTarget`/`itemAncestorChain`/`nestInsert`/`deleteSourceGroup`/`reorderFragment`/`topLevelListPos` — including a regression test tying tree confinement to the outdent transform. The pointer→target band geometry is view-dependent and verified on-device.

### 🧹 Cmd/Ctrl+W closes the tab, not the window (Windows/Linux)
The default `windowMenu` role injects a `close` item bound to `CmdOrCtrl+W`, which — being registered after the File menu's custom "Close Tab" item — won the accelerator and closed the whole BrowserWindow instead of a tab. The app menu now builds the window submenu explicitly (minus the `close` role), so `CmdOrCtrl+W` is bound only to "Close Tab" on every platform; macOS keeps its native "Bring All to Front" via the `front` role.

### 🧹 Semantic-search onboarding no longer re-shows on every restart
The per-account client prefs (semantic-search `prompted`, theme, transparency, block-colorize, locale) were read at construction time, when `getCurrentContext()` was still the LOCAL context — so on boot into a logged-in account the refs held the LOCAL values for the whole session. The onboarding dialog gates on `!settings.semanticSearchPrompted`; the dialog handlers persist `prompted` to the *account* context, but the ref read the LOCAL context (never written) → stayed `false` forever → the dialog re-appeared every restart. `App.vue` now re-reads the client prefs after `auth.init()` (which switches to the restored account's context but, unlike `completeLogin`/`switchToAccount`, doesn't bump `contextChangeSignal`), mirroring the mid-session switch path. For local mode the values are identical → no signal bumps → no-op.

### 🖱️ Editor right-click context menu
Right-clicking anywhere in the editor body now opens a context menu (the same `ContextMenu.vue` overlay the notes list and sidebar use), context-aware to the current selection and editability — clipboard ops are disabled when there's no selection or the note is read-only, formatting toggles show a checkmark against the active marks, and the **Link** row swaps to **Edit link… / Remove link** when the caret is inside a `link` mark.

- **Pure builder + composable** (`utils/editor-context-menu.ts` + `composables/use-editor-context-menu.ts`): `buildEditorMenu(target, deps)` is headless and unit-tested; `useEditorContextMenu(editor, noteId)` snapshots the ProseMirror selection / `isActive` / `getAttributes("link")` / `isEditable` per click and routes actions through the existing `EDITOR_ACTION_BY_ID` registry. The menu is bound via `@contextmenu` on `<EditorContent>` (works through Vue attr fallthrough onto EditorContent's root `<div>`; the handler calls `preventDefault` only when it shows).
- **Clipboard copies the ProseMirror selection, not the live DOM selection.** The overlay takes focus on click, so the DOM selection is gone by the time the action runs — Copy/Cut serialize `editor.state.selection.content()` via `DOMSerializer` into a `ClipboardItem` (`text/html` + `text/plain`); Cut then `deleteSelection()`. Paste reads `navigator.clipboard` (prefers `text/html`, falls back to plain text) and `insertContent`s it. Renderer-only (no IPC clipboard bridge).
- **Link dialog** (`stores/link-dialog.ts` + `components/LinkDialog.vue`, mounted in `App.vue`): a promise-based arbitrary-URL dialog (`openCreate({ requireText })` / `openEdit({ href })` → `{ href, text } | null`) modelled on the color-dialog pattern. `requireText` is set when there's no selection (a link needs visible text); an existing selection becomes the link text. URLs are normalized (`https://` prepended to scheme-less input) and use the same `linkMarkAttrs` as the `@`/`[[` note-link flow.
- **Replace in note**: a new **Replace in note** entry opens the find bar with the replace row already expanded (a new `replaceSignal` / `requestReplace()` in the editor store, mirrored on `findSignal`; `FindBar` gained a `replace-mode` prop). **Find in note** and **Command palette** entries are also exposed.
- **Insert ▸ / List ▸** are one-level submenus (no search) reusing the toolbar's action ids; **Link to note…** routes through the existing `@`-picker (`insertContent("@")` → NoteLinkPicker). Icons are drawn from the static icon registry only (the lazy full Lucide set isn't auto-loaded, so entries without a static icon render unadorned).
- i18n `contextMenu.*` (cut/copy/paste/formatting/link/insert/list/find/replace/palette/deep-link/date…) + `linkDialog.*` added (en + de).

### 🔗 Deep link to a block (copy + paste)
A deep link to the block at the caret — `nn://note/<id>?blockId=<id>` — can now be copied and pasted back as a titled note link, so you can share/anchor a specific paragraph, heading, or list item, not just a whole note.

- **Copy**: a **Copy deep link to block** editor-context-menu entry and an `app:copy-block-link` command-palette entry (group `editor`) compute the block id positionally from the **live rendered DOM** (`utils/editor-block-link.ts` → `blockIdAtSelection` / `blockIdForElement`), mirroring core's `insertBlockIds`: a single global counter over block-level tags (`p`, `h1`–`h6`, `blockquote`, `ul`, `ol`, `pre`, `img`, `iframe`, `div`) in document order → `${tag}${counter}` (e.g. `p1`, `h12`, `blockquote3`). The id is **recomputed, never read from a `blockId` attr** — ProseMirror specs declare no such attr, `data-block-id` is stripped on parse, and a round-tripped attr would break core's renumber-on-save invariant. Falls back to a note-level `nn://note/<id>` link when no block resolves. The palette command uses the focused pane's editor + the active note.
- **Paste** (`editor/deep-link-paste.ts` + `attachments-bridge.ts` `handlePaste`): the copy writes a raw `nn://note/<id>?blockId=` URL as `text/plain` only, which ProseMirror would otherwise paste as literal URL text. `handlePaste` routes deep-link pastes through a pure gate `isDeepLinkPasteText` (trimmed, no internal whitespace, a single whole `nn://note/` token — rejects paragraphs that merely contain a URL, and notebook/monograph links), then `insertDeepLink` → `insertNoteLink` (empty selection → insert the target note's title as the link text + trailing space; selection → link the selected text). Reusing the same helper as the `@`-picker means relation/footer/backlink sync is automatic. Rendered-`<a>` `text/html` pastes are left to ProseMirror's default. (Receiving-side block-scroll is not yet wired — the note-link bridge currently ignores `blockId`.)

### 📆 Open today's daily note (Cmd/Ctrl+D + palette)
A new **Open today's daily note** command-palette entry (`app:open-today-daily-note`) and **Cmd/Ctrl+D** shortcut navigate to the `/daily` timeline and open today's note via `openDailyNote` — revealing the prefilled-title draft (lazy creation on first content) when no daily note exists yet. The shortcut covers the already-on-`/daily` case the view's own mount watcher doesn't re-fire. i18n `command.openTodayDailyNote` added (en + de).

### 🔄 Incremental sync (no whole-list flicker)
Syncing no longer rebuilds the notes list from scratch. Previously every `syncCompleted` ran `notes.load()`, which reset each row's `tags` to `[]` and `color` to `undefined` (the chunked re-query is asynchronous) — so every sync flashed every row's tag chips and color tint. Now only the notes the sync actually touched are patched in place.

- **Per-item merge event**: core's `syncItemMerged` (bridged in `event-bridge.ts`) fires once per note/content item it merges during a sync. The notes store accumulates the affected note ids (`bindSyncEvents`, idempotent — survives `switchContext` since the global `EV` subscription persists), and the `App.vue` `syncCompletedSignal` watcher drains them on completion.
- **In-place apply** (`applySyncedNotes`): patches each affected row's scalars (headline / dateEdited / pinned / favorite / title — skipping a title mid-edit in this window), inserts newly-pulled notes, and removes notes the sync deleted/trashed/archived (`db.notes.note` returns `undefined` for deleted/trashed; `archived` is checked explicitly since `notes.all` excludes archived but `notes.note` does not). Tags/color/preview are re-queried just for the affected notes. Above 32 changed notes it falls back to a full `load()` (a bulk first-sync would otherwise serialize N `db.notes.note()` round-trips through the SQLite mutex). An upload-only / tag-or-notebook-only sync (no merged note ids) leaves the notes list untouched entirely.
- **Carry-forward on full load**: `notes.load()` now carries each surviving row's already-resolved `tags` + `color` across the rebuild, so even the fallback path no longer flashes empty chips/tint while the re-query lands.
- **Sidebar diff-merge**: `collections.load` now `mergeById`-merges notebooks/tags in place (patching existing objects so Vue's `:key`-ed rows reuse their DOM node and unchanged rows don't re-render; append new, drop gone) instead of replacing the arrays — so the sidebar tree doesn't re-render on every sync. Colors/shortcuts/badges are still refreshed on every completion (they may change in a note-less sync), cheaply.
- Removed the temporary `[sync]` diagnostic `console.log`s from `status.ts` / `App.vue` that instrumented the sync-pull investigation.

### 📋 Daily-notes task attribution (three channels, open-only, deduped, counter)
The Daily Notes references panel and timeline now attribute tasks to a day across **three deduplicated channels** — and only **open** tasks — so the timeline counter above a day and the tasks list below the editor always agree.

- **Channels** (pure `attributeTasks` in `utils/daily-notes.ts`): (1) **Linking** — the item's text mentions the date; (2) **Daily note** — the item lives inside that day's daily note; (3) **Created today** — the item lives in a note created that day that does *not* link to another day (a note linking elsewhere is attributed to that other day via channel 1, so it's excluded here to avoid double attribution). Each item counts once per day (identity `noteId#index`); checked/completed items are skipped.
- **Timeline**: the old amber checkbox icon is replaced by a monochrome check + **open-task counter** (`taskRefsByDate.get(iso)?.length`), 0 when no open tasks are attributed. **Panel**: the tasks section heading changed from "Tasks mentioning this date" to "Tasks for this day"; list keys use the stable `noteId-itemIndex`. The scan now gates on notes with at least one *open* checklist item (completed-only notes are skipped) and re-runs on `notes.items` length change, `notes.previews` (autosave), and invalidate.
- The store's scan now builds pure `NoteTaskInput`s (DOM parse stays in the store; attribution logic is dep-free and unit-testable) and the panel/timeline share the single `taskRefsByDate` map.

### 🧹 Popup teardown on tab switch + horizontal wheel scroll
- **Suggestion popups no longer linger across tab switches.** The slash menu, `#` tag picker, and note-link picker are `@tiptap/suggestion` widgets teleported to `<body>`; switching tabs deactivates (but, via `<KeepAlive>`, keeps mounted) the source editor, so the Suggestion plugin never fires `onExit` and the popup stayed painted over the new tab. The editor-layout store now dispatches `app:close-popups` when the active tab *id* changes (not the tab object, so same-tab content/scroll updates don't fire it); the slash-commands and tag-mention renderers `deleteRange` their trigger so the plugin fires `onExit` and cleans up (NoteLinkPicker already listened).
- **Horizontal wheel scroll** (`composables/use-horizontal-wheel-scroll.ts`): vertical trackpad/wheel input is translated into horizontal scroll on the editor toolbar and the tab strip (both `overflow-x-auto`), so you can scroll their overflowed rows without a horizontal-scroll gesture.

#### Verification
- `npm run typecheck` (node + web + contracts) — clean.
- `npm run test:contract` — **1870/1870 tests pass** across 124 files (new `list-drag-reorder.spec.ts`, `editor-context-menu.spec.ts`, `editor-block-link.spec.ts`, `deep-link-paste.spec.ts`, `notes-sync-incremental.spec.ts`; extended `daily-notes.spec.ts`).
- On-site gates: list drag-reorder verified across bullet/ordered/outline (sibling reorder, nest/indent, outdent onto a shallower row, group move of indented parents) — task/checklist drag was already working. Pending: drag-reorder edge cases (drop on list padding, cross-type drops rejected cleanly); `Cmd/Ctrl+W` closing a tab not the window on Windows/Linux; semantic-search onboarding not re-showing after a restart into a logged-in account. Plus the prior batch: editor context menu (clipboard copy/cut/paste + permissions, formatting toggles, link create/edit/remove via the dialog, replace-in-note); copy deep-link-to-block + paste-back as a titled link; `Cmd/Ctrl+D` opening today's daily note; cross-device sync applying incrementally (no chip/tint flicker, new/deleted/trashed/archived notes handled, >32 fallback); daily-notes timeline counter + panel agreement across the three channels; suggestion popups closing on tab switch; horizontal wheel scroll on the toolbar/tab strip.

## [0.15.1] - 2026-07-30

### 🔧 Upstream core v3.4.5

Bumped the vendored `@notesnook/core` (submodule `d4658aa` → `b5140d9`, upstream tag `v3.4.5`) and rebuilt the five runtime packages from source — zero patches to upstream. No app-layer code changed; this picks up one user-visible upstream fix plus internal diagnostics.

- **Deleting your vault now removes *all* vaults**: upstream had an unintentional bug where more than one vault could be created, yet `vault.delete()` only removed the default one — leaving orphaned vaults (and, with `deleteAllLockedNotes`, only the default vault's locked notes were deleted). The fix iterates every vault: when "delete all locked notes" is chosen it collects the locked-note IDs across **all** vaults (de-duped) and removes them, then `vaults.removeAll()` clears every vault. The `vault.delete(deleteAllLockedNotes)` signature is unchanged.
- **Decryption diagnostics**: `user-manager` and `sync` now emit `logger.info` lines tracking which key version decrypts which items (master key / DEK / legacy DEK presence, key count + versions) — no behaviour change, just better forensics when password-change decryption fails.

The editor's prosemirror bump (`view` 1.34.2 → 1.42.2) and `react-node-view` refactor in v3.4.5 are **not consumed** — this build only imports the `ToolId` type from `@notesnook/editor` (the rest of editor-vue is a source-level port), and that type was unchanged, so editor/theme vendored types were intentionally not refreshed.

#### Verification
- `npm run build:vendor:src` — 5 runtime packages rebuilt from source, submodule left pristine, zero patches.
- `npm run typecheck` (node + web + contracts) — clean.
- `npm run test:contract` — 1791/1791 tests pass across 119 files.
- `npm run build` — clean.

## [0.15.0] - 2026-07-29

### 📆 Daily Notes mode
A new **Daily Notes** sidebar mode (`/daily`, top of the nav after All Notes) — a vertical **date-timeline** replaces the notes list; clicking a day opens that day's daily note (a normal note tagged `daily` with an ISO-date title). A references panel inside the daily-note tab lists notes **created/modified that day** plus **checklist items mentioning the date**. Typing or editing a date in *any* note auto-links it to that date's daily note (created if missing).

- **Lazy creation**: clicking a date with no daily note reveals a **prefilled-title draft** (the note is created only when you type content), not an auto-created empty note. Right-click a no-note date → **"Create daily note for {date}"** creates it explicitly. Re-clicking the selected date re-activates its tab (or re-opens it if the tab was closed).
- **Timeline indicators**: an **accent dot** when a daily note exists, an **orange dot** when the day has created/modified references but no note, and a **checkbox icon** when any checklist item mentions the date.
- **Context menus everywhere**: timeline daily-note rows and references-panel rows get the **same context menu** as notes-list rows (extracted into a shared `useNoteContextMenu` composable — pin/favorite/color/tags/notebooks/delete/publish).
- **References panel**: tasks section is shown **first**; the panel lives inside the editor (per daily-note tab + the daily draft), not as a global window strip. References update **live** when a date is added to a checklist item (re-scan on autosave + on opening a date) — no manual refresh.
- **Delete stays in sync**: deleting a daily note drops its timeline dot at once (`refreshDailyNotes` filters trashed notes) and falls back to the prefilled draft for that date.

### 📅 Insert date (slash + palette)
A new **"Date"** slash command (`/date`) and **"Insert date"** command-palette entry open a **month-calendar picker** with today selected. **Mouse**: click any day to insert it; ◀/▶ browse months. **Keyboard**: ←/→ ±1 day, ↑/↓ ±7 days, PageUp/PageDown ±1 month, Home/End = month start/end, Enter inserts, Esc cancels. The inserted date auto-links to that date's daily note (same mechanic as "Today's daily note"). The picker is a host-installed handler on the editor-vue `insertDate` action (`paletteTitle` lets the slash label "Date" and palette label "Insert date" differ), positioned at the cursor.

#### Verification
- `npm run typecheck` (node + web) clean; `npm run test:contract` — 1791 passed (new `daily-notes.spec.ts`, `daily-notes-store.spec.ts`, `insert-date-store.spec.ts`; existing `tool-definitions` / `slash-commands` / `router` / `context-menu-entries` suites green).
- On-site gate pending: timeline click/delete, prefilled draft creation (tab stays active), context menus, timeline dots/icons, calendar picker click + keyboard nav, and a date added to a checklist item appearing in that daily note's references.

## [0.14.0] - 2026-07-29

### ☑️ Toggle a line into a checklist item (Cmd/Ctrl+L)
A new `editor:toggleChecklistItem` action (command palette + **Cmd/Ctrl+L**) turns the current line into a checklist item in place — or, when the caret is already inside a check item (rich `taskList` or simple `checkList`), flips that item's `checked` state. This closes the gap where the only way to get a checkbox row was the Lists dropdown or an input rule.

- **In-place, no lift**: when the caret is inside a bullet / ordered / outline list, the **innermost enclosing list** is rebuilt as a `checkList`/`checkListItem` subtree and swapped in atomically (`tr.replaceWith` in one step — per-node `setNodeMarkup` can't do this, since every intermediate state violates the parent's content rule). Stock `toggleList` would otherwise `wrapInList` and lift the item to the top level ("moved to the first level" bug); this rebuild keeps the item where it is.
- **Children stay bullets** (fixed the same day): conversion is **non-recursive** — only the items at the caret's level become check items; any list nested inside them keeps its original type. So toggling a parent that has children turns just the parent row into a checkbox, leaving the nested children as bullets. Valid because `CheckListItemNode` is configured `nested: true` (`paragraph block*`), so a `checkListItem` can hold a nested `bulletList`. (Siblings of the toggled item still convert — they share the list container, and a `checkListItem` can only live in a `checkList`.)
- **Flip, not re-convert**: when already in a check item, the command flips `checked` via a raw `tr.setNodeMarkup`; the rich task-list's state-management plugin then propagates to children/parents + syncs `stats`, and the simple `checkListItem` node-view syncs its `.checked` class.
- **Shared row + visual indent**: the simple checklist item now reuses the rich task-list's `TaskItemComponent` row (real `<button>` checkbox + drag grip + `data-indent`), replacing the old CSS-drawn checkbox — so a toggled simple check row looks identical to a rich Aufgabenliste row. Tab/Shift-Tab adjust the `indent` attribute via a new shared `utils/list-indent.ts` helper (20px-per-level visual indent, no real nested `<ul>`), matching the rich task-list. `block-colorize` and the context-menu now recognise `checkListItem`.
- **Cmd/Ctrl+K freed**: the `link` extension no longer binds `Mod-k` (it collided with the command-palette hotkey); insert links via the toolbar / `@`/`[[` mention bridge instead.

#### Verification
- `npm run test:contract` — new `toggle-checklist.spec.ts` (8) green; full suite 1750 passed (one unrelated flaky `canvas-theme` timing test).
- On-site gate pending: visual confirmation of toggling a parent item with children (children stay bullets), flipping checked, and Tab/Shift-Tab indent on both rich and simple checklist rows, light + dark.

### 🗂️ Assign notebook / tag / color from the command palette
Three new command-palette entries — **Add to notebook**, **Add tag**, **Assign color** (`app:add-to-notebook` / `app:add-tag` / `app:assign-color`) — let you assign the active note to a notebook, tag, or color without reaching for the right-click menu or the Properties panel.

- **Reuse, don't rebuild**: the commands open the *same* Color / Tags / Notebooks submenu builders the right-click context menu uses (`utils/context-menu-entries.ts`), now wired to the active note via a new `buildActiveNoteAssignmentDeps(target)` in `utils/assignment-menu.ts` (mirrors `NotesList.vue`).
- **Standalone submenu mode**: new `showSubmenu(spec, x, y)` standalone mode in the context-menu store (+ `standalone` flag) opens a submenu with no root menu — `ContextMenu.vue` hides the root panel, centres the submenu, and closes on ArrowLeft/Escape. The submenu builders' deps type was narrowed to an assignment-only slice so commands don't stub unrelated callbacks.
- **Editor focus restored after assigning**: the editor used to stay blurred after the submenu closed — the caret didn't return to where you'd been typing. The command now captures the focused pane's editor while the palette is open (ProseMirror keeps its selection across the blur) and refocuses it once the submenu closes, so the caret lands back where it was.
- i18n keys `command.addToNotebook` / `addTag` / `assignColor` added (en + de).

#### Verification
- `npm run test:contract` — context-menu / bridge-router suites green.
- On-site gate pending: open each command from the palette and confirm the submenu opens centred and assigns correctly.

### 🎨 Block-colorize adapts its palette for contrast on any theme
The block-colorize toolbar toggle (which tints editor text by node/mark type — headings→yellow, bold→red, italic→green, links→purple, list items cycle by nesting depth, code tokens by Prism class) now keeps its colours readable on **any** theme, including 3rd-party catalog themes whose background colours aren't known at build time. The colour source — the theme system's `--*-static` Material palette — is theme-invariant (same hex in light and dark), so without adjustment bright colours (yellow/green/orange) washed out on light backgrounds and dark purple washed out on the dark editor surface.

- **Measured, not assumed**: at theme-inject time each colour is checked against the resolved theme background; if it falls below WCAG AA (4.5:1) its OKLCH **lightness** is shifted (hue + chroma preserved) until it meets the target. Colours already passing are left untouched, so the palette stays vibrant where it already reads — only the offending colours move.
- **New `theme-vue` colour math** (`packages/theme-vue/src/color-contrast.ts`): pure, dependency-free WCAG contrast + OKLCH forward/inverse (`adjustForContrast`, `CONTRAST_TARGET = 4.5`). `block-colorize.ts` (`blockColorizeToCSS`) resolves the base primary `background` and emits a `:root { --bc-*, --bc-code-* }` block; `injectTheme` calls it, so the palette recomputes on every theme switch.
- **CSS consumers** (`style.css`) now read `var(--bc-heading, var(--yellow-static))` etc., with the `--*-static` colour kept as a fallback for the pre-injection first paint. No editor-vue or bridge changes — only the resolved colour values change.
- `CONTRAST_TARGET` is a one-line knob: drop to `3.0` (AA-large) if the 4.5 floor reads too muted on light themes (only the worst offenders — yellow/green/orange/gray — would then shift).

#### Verification
- `npm run typecheck` (node + web + contracts) — clean.
- `npm run test:contract` — new `color-contrast.spec.ts` (WCAG math, OKLCH round-trip, adjust-for-contrast direction/hue-preservation, `blockColorizeToCSS` emits all `--bc-*`/`--bc-code-*` meeting 4.5 against both built-in backgrounds); extended `theme.spec.ts` `injectTheme` suite. 1743 tests green.
- On-site gate pending: visual confirmation across light + dark themes (and ideally a 3rd-party catalog theme) — toggle the palette button on a note with headings/bold/italic/lists/a code block.

### 📋 Collapsible bullet & numbered lists
Plain bullet lists and numbered lists are now collapsible in-place (a chevron toggle in the left gutter), like the pre-existing outline list — closing a long-standing gap where the editor had two bullet-list node types (stock `bulletList`, no collapse, and the custom collapsible `outlineList`) that were otherwise functionally identical.

- **Minimal extension**: `CollapsibleBulletList`/`CollapsibleOrderedList` extend the stock TipTap `BulletList`/`OrderedList`, adding only a `collapsed` attribute (serialized `data-collapsed="true"`). `CollapsibleListItem` extends the shared `ListItem` with a Vue node-view that draws the `•` marker and a chevron only on items that contain a child list; click flips the child's `collapsed` via `tr.setNodeMarkup`. Inherited unchanged: the `toggle*` commands, `- `/`* `/`1.` input rules, `Mod-Shift-8`/`7`, and Enter/Tab/Shift-Tab behaviour.
- **Bullet ≡ outline**: the bullet list now renders identically to the outline list — native `::marker` is suppressed and the node-view draws the same self-drawn `•` (both: 1.5rem gutter, dot kept on hover/collapse, chevron beside the dot). Ordered lists keep their native numbers (the dot is hidden for `ol`) and use a wider 2rem gutter so the left-aligned chevron clears multi-digit numbers. Collapsed subtrees are hidden by CSS; the ProseMirror doc still holds them.
- **No migration**: `collapsed` defaults false; existing `<ul>`/`<ol>` notes are unchanged. The dot/chevron are node-view DOM, not in `getHTML()`, so serialized HTML round-trips unchanged. Editor.vue disables the stock `bulletList`/`orderedList`/`listItem` and registers the `Collapsible*` variants instead.

#### Verification
- `npm run typecheck` (node + web + contracts) — clean.
- `npm run test:contract` — editor HTML / note-preview / sn-importer / tool-definitions suites green.
- On-site gate pending: visual confirmation of collapse/expand on nested bullet and numbered lists, light + dark.

### ☑️ Simple checklist (mobile checklist round-trips on desktop)
The mobile editor's checkbox list — `<ul class="simple-checklist">` / `<li class="simple-checklist--item">`, a flat checkbox list with no header/progress bar — is now recognised on desktop so mobile notes round-trip faithfully. Without it, `ul.simple-checklist` fell back to a plain bullet `listItem` (the checklist read as "just a list").

- **Pure-CSS checkbox** (`extensions/check-list` + `check-list-item`): no Vue node-view component — the checkbox is drawn in CSS (`::after` outline, `::before` masked checkmark) and toggled by a left-edge click hit-area in the plain-DOM node view. Nested check lists nest as real child `<ul class="simple-checklist">` inside the parent `<li>` (no `data-indent` flattening), since the simple checklist has no header.
- **Toolbar**: a new "Task (single)" entry is added to the Lists dropdown (`simpleCheckList`), distinct from the rich "Task list" (the existing `checkList` ToolId → rich task-list). The two share the `checkList` string only by name collision — the ToolId is the rich task-list, the TipTap node/command `checkList` is the simple one.
- **Import**: the Standard Notes importer now emits the simple checklist (`simple-checklist--item`) for SN checklists — SN checklists are flat checkbox lists, not task boards. `note-preview` counts both `li.checklist--item` and `li.simple-checklist--item` so imported/mobile checklists show progress and appear in the Tasks view.

#### Verification
- `npm run typecheck` (node + web + contracts) — clean.
- `npm run test:contract` — sn-importer / note-preview / tool-definitions suites green.
- On-site gate pending: visual confirmation of a simple-checklist note (toggle, nested), light + dark.

### ✨ What's New window shows the newest release notes
The Changelog / What's New window now fetches the latest `CHANGELOG.md` from the app's GitHub repo at runtime and shows the **newest** version's release notes, instead of being limited to the installed version's notes (which are baked into the renderer at build time and so only ever contain entries up to the shipped version). When the newest published version is newer than the installed one and the auto-updater hasn't flagged an update (e.g. in dev), the window surfaces a subtle "Version X is available" hint with a link to the GitHub release.

- **New main-process capability**: `changelog` tRPC router (`src/main/changelog-fetcher.ts`) — fetches raw `CHANGELOG.md` from `raw.githubusercontent.com/marcolaux/notesnook-vue/main`. Plain `fetch` (no Electron import → works in dev + packaged, unit-testable by stubbing `global.fetch`); never throws across the bridge (network/parse failures report an `error` status with `text: null`); ~10-minute in-memory success cache so repeated window opens don't re-hit the network. Uses raw (CDN-served) not the GitHub Releases API → no 60/hour unauthenticated rate limit. Mirrors the `upstream-checker.ts` pattern.
- **Renderer**: `ChangelogLayout.vue` fetches on mount; content resolution is **provider release notes → remote newest section → baked installed-version fallback** (silent on failure — no error banner, the baked notes still show). The version label follows the newest version.
- **No new privacy toggle**: this contacts the app's own public repo (the same one the auto-updater's publish provider reads), on-demand when the window opens — not at boot. The upstream-release notifier keeps its separate toggle because it contacts a *different* repo.

#### Verification
- `npm run typecheck` (node + web + contracts) — clean.
- `npm run test:contract` — new `changelog-fetcher.spec.ts` (7) passes; i18n / bridge-router / markdown / updater / upstream-checker suites green.

## [0.13.0] - 2026-07-28

### 👤 Per-account Settings + Settings Window Restructure
The Settings window is now organised as a **Global** group (device-wide sections — Sync, Backup, Import, Attachments, Updates) plus **one group per account** (Local + every logged-in account), each exposing the five per-account sections — Appearance, Language, Notes, Search, Vault. Clicking a per-account section live-swaps the window's context in place (no reload) so each account keeps its own values; the titlebar account dropdown is removed (the sidebar lists every account).

Previously device-global client preferences are now **per-account**: appearance (theme mode, transparency, the dark/light theme slots), language (locale), Notes (default note/task templates + block-colorize default + per-note overrides), and Search (semantic-search enable/prompted toggles). Vault and the `db.settings`-backed Notes fields (formats, default notebook/tag, `vaultLockAfter`) were already per-account.

- **New client-only + per-account storage tier** (`platform/per-context-prefs.ts`): namespaces localStorage keys as `notesnook.<base>.<ctx>` where `ctx` is `"local"` or the 16-hex email hash. **Lazy legacy migration** — reads fall back to the un-suffixed key and copy it into the ctx key on first contact, so an upgrading user's existing preference carries forward. Pure + headless-testable (callers pass `ctx` explicitly).
- **Context-gated cross-window sync** (`App.vue` storage listener): a theme/locale/template change for account A no longer flips account B's window. `matchCtxKey` parses the event key and validates the suffix is a real context id (`isCtxId`) so a base that is a string-prefix of another base (`notesnook.theme` vs `notesnook.theme.dark`) never swallows the longer key. A legacy un-suffixed write (ctx null) is applied to the current context as a transitional safety net.
- **Context-switch reload**: the main window's `contextChangeSignal` watch and the Settings window's `switchContext` both re-run `loadClientPrefs` / `reloadLocale` / `reloadBlockColorize` for the now-active account; `loadClientPrefs` bumps the theme/transparency signals only on change so every window's existing watches re-apply.
- **Deep-link pinning**: `openSettings({ contextId })` opens (or reloads) the Settings window pinned to a caller's account via `?ctx=<id>`; the app menu, sidebar, command palette, and `Cmd/Ctrl+,` all pass the focused window's context. Same section + same ctx → just focus (no reload).

**Decisions (by design):**
- Per-account prefs are **local-only, not synced** across devices — they live in namespaced localStorage, never in `db.settings`, so no upstream sync-schema change. They travel with the account on *this device*, not across devices.
- Theme + locale are **renderer-only per-account**. Electron keeps `nativeTheme` and the app-menu/tray locale process-global, so two simultaneously-open account windows cannot show different OS chrome; in-app CSS theme + vue-i18n labels are fully per-account, and OS chrome follows the focused/main window best-effort (`setLocale` notifies main; an in-window account switch's `reloadLocale` deliberately does not).

### 💾 Per-account Auto-Backup Scheduler (with attachment dedup pool + restore)
A per-account automatic backup that runs in the main window. On a tick it enumerates **every** context (Local + all logged-in accounts) and writes each account's backup into its own subdirectory of the configured `backupDirectory`, honouring both cadences (partial = notes/content; full = with attachments), the `encryptBackups` toggle, and rotating to keep the last `backupRetentionCount` per account per mode. Full backups now include attachments — backed by a content-addressed dedup pool — and can be restored from their folder.

- **Main window only** (timers die with the window, matching the updater/notifier/reminders pattern); `init()` re-arms on the next boot. An `inFlight` guard prevents tick overlap; `initialized` guards reload re-entry.
- **Per-context isolation**: a failure backing up one account never aborts the tick or skips the next — each context is wrapped in try/catch.
- **Throwaway account DBs**: non-active contexts use a throwaway `Database` (`openAccountDb`, the same factory pair the importer uses) — no `bindEventBridge`, no live-swap; the active context reuses the singleton (its exclusive SQLite lock would contend if re-opened). Core has no `Database.close`, so the throwaway ref is simply dropped (GC).
- **Dual-cadence stamps**: core's `db.backup.lastBackupTime` is a single per-context KV that can't distinguish last-partial from last-full, so the scheduler keeps its own per-context per-mode last-run timestamps in localStorage for gating.
- **Full mode = directory tree + content-addressed dedup pool** `<sanitized>/full/<stamp>-full/` with the `.nnbackup` marker, `attachments/.attachments_key`, the data chunks, and `attachments/manifest.json` (the hashes this backup references). The cached attachment blobs themselves live **once** in a per-account pool `<sanitized>/attachments/<hash>` (raw **encrypted** bytes — NOT decrypted); a blob already in the pool is skipped, so an unchanged attachment costs zero I/O on later backups. Dormant accounts (expired login) back up notes + only their locally-cached attachments; uncached ones are skipped silently and stay listed in the manifest (restore tolerates a missing blob — sync re-fetches).
- **`db.fs()` is a wrapper — use the raw singleton.** Core's `db.fs()` returns a `FileStorage` wrapper exposing only the standard `IFileStorage` methods, NOT the desktop-only `__rawReadStream`/`__rawWriteBytes`. The original `readAttachmentStream` structurally-cast `db.fs()` and was a silent no-op (the prop was `undefined` → every attachment skipped → full backups wrote **zero** blobs). Fixed: `readAttachmentStream`/`writeAttachmentBytes` now go through a module-level `DesktopFileStorage` singleton (`getRawFileStorage()` in `platform/fs.ts`), bypassing the wrapper. The local chunk store is global (`userData/attachments/`), so one instance reads/writes any context's cached blobs.
- **Manifest-first = cross-process GC safety.** The manifest is written BEFORE any blob lands in the pool, listing every hash core yielded progress for (the intended set). The pool + GC are shared on disk across renderer processes (the auto-tick runs in the main window; the manual "Back up now → Full" runs in the Settings window), and module-level `inFlight` is per-process so it can't reach across — but anchoring the manifest first means a concurrent GC pass sees the references before any blob exists and never sweeps a blob this backup is about to claim. A listed-but-uncached hash (no local stream → never written) is harmless.
- **Partial = single `.nnbackup`** mirroring the manual "Back up now" flow. A multi-chunk partial (>10MB, the `.nnbackupz` case) is now **refused** — `writePartialBackup` returns `false` and writes nothing, rather than writing a truncated chunk-0 the user would trust; `backupContext` then skips stamp/rotate/notify so the next tick retries (large accounts should use full mode, which writes every chunk at its own path).
- **Restore from folder**: `restoreFullBackupFromDir` imports every data chunk in index order (with the `attachments/.attachments_key` + password for encrypted backups), then writes the referenced blobs back into the local chunk store — pool-first (`<sanitized>/attachments/<hash>`) with an inline `<dir>/attachments/<hash>` fallback for old-layout backups. Missing blobs are tolerated. The renderer path guard `relativeChild` (pure, in `utils/backup.ts`) normalises `\` → `/` so Windows backslash backup paths aren't wrongly rejected as outside the backup directory (the main-process `safeChild` uses `resolve` and was already separator-agnostic).
- **GC** (`gcAttachments`, mark-and-sweep, run after rotate so the just-written manifest is always retained): lists the pool, reads each retained full backup's `manifest.json` (tolerates old-layout dirs with no manifest), and deletes unreferenced pool blobs. Old-layout inline blobs live inside the rotated `<stamp>-full/` dir and are removed with it by rotate, not by GC.
- **Manual "Back up now → Full"** (`BackupSection.vue` → `backupNowFull`) reuses the same writer + pool + rotate + GC, so manual and auto full backups dedup against one shared pool per account. A same-process `inFlight` double-fire guard rejects a rapid second click; cross-process safety is the manifest-first data-layer fix above. It stamps the full cadence so an imminent auto-tick doesn't redo it.
- **Auto-run desktop notification**: when the auto tick creates a backup, a desktop OS notification fires (title + a body built by the pure `buildBackupNotificationBody` — notes-only for partial, "N included" + "(N not cached — skipped)" for full). Manual/create-now keeps the inline "Backup saved." line. Enable-cadence (Never → a schedule) offers a "Create a backup now?" confirm.
- **New main-process capabilities**: the `backupFs` tRPC router (`src/main/backup-fs.ts`) — directory-scoped mkdir / write text+bytes / list / delete file+dir (mutations) plus `exists` / `readFileText` / `readFileBytes` (queries, for the pool skip-if-exists + restore/GC read-back), all behind a stateless path-containment guard (`safeChild`, exported for a test) so a crafted `path` cannot escape `root`. Also `dialog.confirm` (Enter doesn't trigger "Yes") and `notifications.show` (GC-safe Electron `Notification`, click → focus main window).
- **Backup settings UI**: a retention-count selector (1–10), "Restore from folder", and explanatory notes in Settings → Backup.

#### Verification
- `npm run typecheck` (node + web + contracts) and `npm run lint` — clean.
- `npm run test:contract` — **1919/1919 tests pass**. Backup coverage: `auto-backup.spec.ts` (pure helpers incl. `relativeChild` cross-platform), `auto-backup-write.spec.ts` (manifest-first ordering + dedup), `auto-backup-gc.spec.ts` (mark-and-sweep), `auto-backup-tick.spec.ts` (store orchestration: no-root short-circuit, per-context isolation, partial success + refusal/`created`-gate, full success, `backupNowFull` success + same-process double-fire guard + export-error recovery), `backup-restore.spec.ts` (dir-tree restore), `backup-rawbytes.spec.ts`.
- On-site gate pending: verify a real full backup writes pool blobs (dedup on the 2nd tick), then restore-from-folder opens an attachment offline — incl. on Windows (the `relativeChild` separator fix); repeat with `encryptBackups` on; confirm an old-layout (pre-dedup) full backup still restores via the inline fallback; verify the enable-cadence "create now?" confirm + the auto-run desktop notification fire on-device.

## [0.12.0] - 2026-07-28

### 📥 Import from Standard Notes (lossless, via Lexical JSON)

A new **Settings → Import** section migrates Standard Notes notes into a Notesnook account losslessly — reading the **Lexical editor-state JSON** each Super note serialises (`note.text` = `editor.getEditorState().toJSON()`), **not** the lossy `.md` export. The markdown export silently drops formatting the JSON keeps (multi-paragraph table cells collapse to a literal `\n`, underline is dropped entirely, row-header cells / `snfile.zoomLevel` / link metadata are lost); the JSON preserves all of it, and the Notesnook editor supports nearly all of it (tables with multi-block cells, task lists, headings, bold/italic/strike/**underline**/**highlight**, links, hard breaks, code blocks).

- **Pure converter** (`packages/editor-vue/src/sn-importer/lexicalToTipTap.ts`): an async tree-walk `lexicalToTipTapHtml(editorState, resolvers, title)` that emits the TipTap HTML Notesnook persists (`db.notes.add({ content: { type: "tiptap", data: html } })`). Every editor extension round-trips via its `parseHTML` rules, so the emitted HTML re-parses to the same document the editor would produce. Schema-agnostic and unit-testable with stub resolvers (no db/editor deps). Lexical text `format` bitmask → marks in a fixed nesting order (`strong>em>u>s>sub>sup>code>mark`).
- **Account picker**: Settings is a single shared window, so the user picks which account to import into. The importer builds a **throwaway account-scoped `Database`** via the existing `createDesktopPlatform(ctx)` + `initDatabase(...)` factory pair (the same one `bootstrap`/`switchContext` use) **without** assigning the singleton — no live-swap, no core changes, no UI reload. Account contexts are already authenticated (cached User + master key); local is bootstrapped via `ensureLocalUser`.
- **Recursive scan + global media lookup**: the chosen folder is walked recursively (`importFs.listRecursive`) for every `.json` note in subfolders, and a media index is built over the **whole tree** so a `snfile`'s attachment is resolved anywhere under the root (first match wins), even in a different subfolder than the note that references it.
- **Legacy-extensionless fallback**: some SN exports name attachment files by the FileItem's *content* uuid, not the `snfile.fileUuid` (item uuid), and the note JSON carries no manifest mapping them. The companion `.md` lists the on-disk files in the same document order as the JSON's `snfile` nodes, so `augmentMediaIndexFromMarkdown` maps any unresolved `snfile` positionally to the next `./<file>` reference (prefixed with the note's folder). The markdown is used **only** for the file-name mapping; all content still comes from the JSON.
- **Attachments + hashtags**: media is ingested as encrypted Notesnook attachments (`db.attachments.save`) and routed by sniffed MIME to image / audio / video / file-chip nodes. SN hashtags (Lexical `hashtag`, no id) become real Notesnook tags (`db.tags.add` + `db.relations`), rendered as inline tag-mention chips.
- **One new main-process capability**: `importFs` tRPC router (`list`/`listRecursive`/`readBytes`/`readUtf8`) in `src/main/import-fs.ts` — directory-scoped bulk read with a path-traversal guard. Existing `db.notes.add` / `db.attachments.save` / `db.tags` are reused.

#### New: inline Audio + Video editor nodes
Notesnook had no native audio/video node — only `<img>` and `<iframe>` embed. Two new atom block extensions (`packages/editor-vue/src/extensions/{audio,video}/`) mirror `ImageNode` (same `data-hash` attribute surface) and render styled `<audio controls>` / `<video controls>` players that lazy-load the encrypted blob via the existing `editor.storage.getAttachmentData({ hash })` hook (no new storage wiring). Registered in `Editor.vue` alongside `ImageNode`. The importer emits hash-only `<audio data-hash …>` / `<video data-hash …>` nodes for SN audio/video attachments (e.g. the MP4s in the sample export), which the players resolve on view.

#### Nested checklists flatten, not nest
Standard Notes checklists are header-less (just checkboxes); Notesnook's `taskList` renders a full header (title / progress / clear-completed) at **every** nesting level. A check list nested in a check item would therefore stack two headers — "a checklist within a checklist" with an empty wrapper item. The converter now flattens nested check lists into their parent `taskList` using `data-indent` (Notesnook's own task-item indentation mechanism): nested check items become indented sibling `taskItem`s under a single header, checkboxes preserved, and an empty check item that merely wraps a nested check list is dropped.

### 🎨 Block Colorize (port of sn-super-colors)
A faithful port of the Standard Notes `sn-super-colors` theme, adapted to TipTap/ProseMirror. Colorizes block and inline elements by type (headings, bold, italic, links, list items by nesting depth, code syntax tokens) using the host theme's `--*-static` categorical palette (theme-invariant — no re-tinting). The visual rules live in `style.css`, gated by a `.block-colorize` class on `.ProseMirror`; the `BlockColorize` ProseMirror plugin stamps a `data-list-level` attribute on each `<li>` (CSS can't count nesting depth). A global default + per-note override (localStorage) drive the effective state; a toolbar toggle (palette icon) in the editor toolbar flips it for the current note, and Settings → Notes has the global default. A host bridge (`editor/block-colorize-bridge.ts`) keeps `editor.storage.blockColorize` in sync — `isActive` reads storage, so the toggle re-evaluates via a no-op meta-transaction (the toolbar bumps its `version` on every editor transaction).

### 📒 Per-Template Notebook Policy + Notebook Picker
A per-template "notebook on creation" policy (None / Ask / Fixed) stored as a JSON map in one `db.settings` row under `custom:templateNotebook` (upstream Notesnook has no per-template-metadata concept; a notes-table column would be stripped by the schema sanitizer, so a settings row is used). Settings → Notes shows a per-template row to choose the mode (and the fixed notebook). When a template's policy is "Ask", `notes.create` opens a headless **notebook picker** (`NotebookPickerDialog.vue` + `useNotebookPickerStore`) — a single-select overlay (Cancel = abort, "None" = create with no notebook, a notebook = file into it). The policy fires for the default-template fallback too.

### 🐛 Bug Fixes
- **Vector search targeted the wrong database after an account switch.** The `vec0` `vec_notes` virtual table is created in the *active account's* SQLite handle on open, but vector-search was still keyed to the previous context's handle after `switchContext`/login live-swapped the `Database`. Fixed by resolving the active context (`getCurrentContext()` + `dbFileName(ctx)`) so vector search targets the `notesnook-<contextId>` handle that actually holds `vec_notes`.

#### Verification
- `npm run typecheck` (node + web + contracts) — clean.
- `npm run test:contract` — **1645/1645 tests pass** across 111 files (54 importer tests: 36 converter unit + 18 fixture/recursive/markdown-fallback).
- `npm run build` — clean (7.0s).
- On-site gate pending: run the importer against a real export folder (images/video inline, multi-paragraph table cells, nested checklists flattened to one header) and confirm block-colorize + per-template notebook policy in Settings.

## [0.11.1] - 2026-07-27

### 🐛 Fix: `no such module: vec0` in the packaged build

The packaged app failed at boot with `TRPCClientError: no such module: vec0 (query: select … from pragma_table_info(?) …)`, blocking the database from initialising. Vector search (`vec0`) worked in dev but not in the installer — two packaged-build gaps in the `sqlite-vec` loadable extension:

1. **`sqlite-vec` was not declared in `apps/desktop/package.json`** — only in the monorepo root. electron-builder packages `apps/desktop`'s production deps, so the `sqlite-vec` npm wrapper **and its per-platform `vec0.<dylib|so|dll>`** were excluded from `app.asar` entirely. At runtime `sqliteVec.getLoadablePath()` → `require.resolve('sqlite-vec-<os>-<arch>/vec0.<suffix>')` threw (module not found) → the error was swallowed by the existing `try/catch` → `vec0` never registered → the first schema query touching a `vec0` virtual table failed with `no such module: vec0`. Fixed by adding `sqlite-vec` + its five platform `optionalDependencies` (`darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`, `windows-x64`) to `apps/desktop/package.json`, mirroring the existing `sqlite-better-trigram` / `sqlite3-fts5-html` declarations. The `asarUnpack` globs (`node_modules/sqlite-vec/**`, `node_modules/sqlite-vec-*/**`) were already present, so the dylib now ships unpacked in `app.asar.unpacked`.

2. **`sqliteVec.load(db)` resolved the in-asar path** — even once packaged, `getLoadablePath()` returns a path inside `app.asar`, and SQLite's native `load_extension` can't `dlopen` a shared library from inside the asar virtual filesystem (Electron patches Node `fs`, not the OS `dlopen` path). The FTS5 tokenizer extensions already rewrote `.asar` → `.asar.unpacked` in `getExtensionPath`; `sqlite-vec` did not. Fixed by resolving the path ourselves and loading via `db.loadExtension(toUnpackedPath(sqliteVec.getLoadablePath()))`, where `toUnpackedPath` is a new idempotent helper (no-op in dev / when already unpacked) that `getExtensionPath` now shares — so all three loadable extensions (better-trigram, fts5-html, vec0) load from disk in packaged builds.

`vec0` loads in the `PRAGMA key` run's `finally` (deferred until the DB is decrypted), ahead of any migration query that introspects `vec_notes`, so the boot flow completes.

#### Verification
- `npm run typecheck` (node + web) — clean.
- `npm run test:contract` — **1579/1579 tests pass** across 107 files (also fixed a flaky `canvas-theme` `onThemeChange` test that raced under parallel load — happy-dom's `MutationObserver` delivers via macrotask; the assertion now polls until the expected call count instead of a single `setTimeout(0)` yield).
- `npm run build` — clean (8.49s).
- `npm run package:dir` — **verified `vec0.dylib` lands in `app.asar.unpacked/node_modules/sqlite-vec-darwin-arm64/vec0.dylib`** and the asar keeps the virtual stub `getLoadablePath()` resolves, so `toUnpackedPath` can rewrite it to the unpacked real path.
- On-site gate pending: install the v0.11.1 build and confirm the app boots (no `no such module: vec0`) and vector search works.

## [0.11.0] - 2026-07-27

### 👥 Multi-Account: One Window per Account, Simultaneously

Several accounts can now be open at once — **one account per window** — so you can keep a local-only workspace, an upstream Notesnook account, and a self-hosted account side by side without signing out. Each window is its own Electron renderer process with its own encrypted SQLite database, its own keychain namespace, and its own server host config, so an upstream account and a self-hosted account coexist cleanly (core's `Hosts` is a per-process singleton — per-window is the right granularity; two different-host accounts in the *same* window remains impossible).

#### Account switcher (sidebar)
- A new **account button** in the sidebar footer opens a context menu (rebuilt on each open so it reflects the current registry + active context): **Local mode** (always present, checkmark when active), one row per logged-in account (email + checkmark when active), an **Open in new window ▸** submenu (Local + each account → a fresh full-shell window bound to that context), **Add account**, **Sign out of this account**, and a **Remove account… ▸** submenu (non-active accounts only, destructive).
- **Switch in-place** is token-based — no password re-entry. The account's auth token lives in its own DB's KV and its master key in the per-context keychain, so switching this window to a known account live-swaps the `Database` and re-reads the user → logged-in, then bumps `contextChangeSignal` so `App.vue` reloads notes/collections. Other windows are untouched (each holds its own in-process context).
- **Sign out** is non-destructive: it live-swaps back to the local DB + drops to the login screen, keeping the account's DB + token intact for a future switch back. **Local mode** (the switcher tile) swaps to the local DB + enters local mode (skip flag on, shell shows local notes), also keeping the account intact — distinct from Sign out (which shows the login screen).
- **Remove account** wipes the account's keychain secrets, deletes its encrypted SQLite file (+ journal sidecars, closing any open handle another window holds), best-effort deletes its per-context IndexedDB, and drops the registry entry. The active account is refused.

#### Account registry + per-window plumbing
- New **`userData/accounts.json`** registry (mirrors the `app-state.json` atomic-persist pattern): `{ contextId, email, serverConfig, label?, lastUsed }` per known account. `"local"` is implicit — always available, never listed, never removable. `hashEmail` is one-way so the email is stored for display. Local-only, never synced.
- Each window is **pinned to its context at creation** via `?ctx=<contextId>` in the URL (`main/note-window.ts`, `pane-window.ts`, new `account-window.ts`). `bootstrap(contextId?)` reads it (`ctx ?? readWindowContext() ?? readCurrentContext()`) so each window opens its OWN account's encrypted SQLite context. `getCurrentContext()` (already per-process) is the per-window source of truth — auth, session persistence, and App.vue use it (not the shared `localStorage` pointer) so windows don't fight over the shared pointer.
- **Per-window server config**: `bootstrap.resolveHostsForContext(ctx)` looks the account's `serverConfig` up in the registry so an upstream + a self-hosted account coexist (each window's process holds its own `Hosts`). Local + unknown fall back to the shared `readServerConfig()`.

#### Add account → new login window
- **"Add account" opens a brand-new window** on the login screen (`?ctx=local&signin=1`) rather than re-arming the login screen in the current window. The caller's window keeps working in its current account while you sign into another. The sign-in window boots the local context (so no cached-account auto-login) and forces the login screen via a new `forceSignIn` ref + `effectiveShowShell = showShell && !(forceSignIn && !isLoggedIn)` getter; the router guard + App.vue route-settling key off `effectiveShowShell` so the sign-in window stays on `/login` until login completes. After sign-in, `isLoggedIn` flips → the shell shows the new account; the caller's window is untouched.

#### Self-hosted login — no restart
- The old **"Apply and restart"** is gone. `LoginScreen.applyServerConfig()` now validates + persists the chosen server config and returns a boolean — **no `location.reload()`**. `submit()` applies the config *before* `auth.login`, so `switchContext(accountCtx)` → `resolveHostsForContext` falls back to `readServerConfig()` (the just-written custom config) for a brand-new account → its DB is built against the self-hosted hosts → authenticate → `completeLogin` records the config in the registry for next time. Button relabeled `login.apply`. Per-window server config is what made the restart unnecessary.

### 🪟 Multi-Window Restore on Relaunch
- Quitting and reopening the app now **restores one full-shell window per account that was open at quit** (local + each logged-in account), each pinned to its own context via `?ctx=` and at its saved size/position. Previously only the last-used account's window reopened.
- `session.json` gains an optional `openMainWindows: string[]` (ordered contextIds with an open main shell window; additive → no version bump, old files fall back to single-window restore). `session-state.ts bindContext` (which fires for full-shell windows on boot *and* re-fires on an in-window context switch) appends the context and installs one `closed` listener per window that removes the window's **current** context (looked up at close time — so a sign-in window that completed into account B drops B, not its first-bound "local"); a `quitting` flag set in `flushSession`/`before-quit` makes quit-driven closes skip the removal so the list survives to next launch. The pure `orderOpenMainWindows(file, validContexts)` helper orders `lastContext` first (it gets the primary tray/updater/deep-link wiring) and filters out removed accounts (valid = `local` ∪ registry contextIds) so a deleted DB is never reopened. The `before-quit` handler now sends `app:before-quit` to **all** windows (each also has a per-window `beforeunload` flush).
- **Granularity is per-context** (one window per context — matches the one-`mainBounds`-per-context model), not per-window: two windows of the *same* context share one bounds slot, so only one restores. Multi-window forwarding of tray/updater/reminder/data-changed signals to the focused window (vs. the primary) is deferred.

### 🐛 Bug Fixes
- **Switching to Local from the account switcher while logged in did nothing.** `switchToAccount("local")` looked up the registry entry, but Local is implicit (never listed), so it bailed. Local is now special-cased: live-swap to the local DB + enter local mode (skip flag on, shell shows local notes), keeping the account's DB + token intact — the per-window analogue of Sign out, landing in local mode instead of the login screen.
- **Blank login window** (`?signin=1` "Add account" path): `emailPlaceholder: "you@example.com"` (en) / `"du@example.com"` (de) broke vue-i18n's message compiler — `@` is linked-message syntax → `SyntaxError: Invalid linked format` → the LoginScreen render aborted → blank. Fixed by escaping as `you{'@'}example.com` / `du{'@'}example.com` in both catalogs (the only `@` occurrences). The LoginScreen also gained a known-accounts row (pre-fills the email + applies that account's `serverConfig` for re-login).

#### Verification
- `npm run typecheck` (node + web) — clean.
- `npm run test:contract` — **1579/1579 tests pass** across 107 files (new `account-switcher-menu` 7, `server-config` schema 8, `orderOpenMainWindows` 9, `readWindowContext` cases, `auth` +2 for the Local-switch fix).
- `npm run build` — clean (8.64s).
- On-site gates pending (per the headless-first, batch-on-site convention): two windows two accounts simultaneously; switch in-place (token-based, no password); switch to Local while logged in; "Add account" → new login window; add a self-hosted account without restart; quit + relaunch reopens all account windows; close one window manually then quit → only the survivor reopens; remove an account.

## [0.10.0] - 2026-07-27

### ⚡ Vector Search Transaction Batching (Phase B) + Diagnostic Logging Gate

#### Vector Search — Multi-Statement Transaction Batching (Phase B)
- **Multi-chunk `vec_notes` writes collapsed into one transactional IPC**:
  - New `sqlite.runBatch` tRPC mutation runs an array of `{sql, parameters}` write statements in a single `better-sqlite3` transaction (`BEGIN … COMMIT`, `ROLLBACK` on any statement error), replacing the previous one-IPC-round-trip-per-chunk loop in `indexNoteEmbeddings`.
  - For an N-chunk note re-index this cuts **N IPC hops → 1** and **N auto-committed WAL fsyncs → 1**, the remaining per-chunk overhead after Phase A offloaded inference to a Web Worker.
  - `indexNoteEmbeddings` now **collects** per-chunk `UPDATE`/`INSERT` statements (plus the optional trailing-chunk `DELETE` as the first batched statement — order-safe: it targets `chunk_index >= chunks.length` while the loop targets `< chunks.length`) and flushes once via `runSqlBatch`. The activity-gated interrupt early-return flushes partial progress before re-queueing (safe — the next run skips matched chunk hashes). The 30ms frame yield and `isUserRecentlyActive` interrupt checks are preserved, so UI-smoothness/interruptibility semantics are unchanged.
- **Main-process refactor (`main/sqlite.ts`)**:
  - Extracted a synchronous `prepareCached(sql)` (cache-or-prepare, no retry) for use inside `better-sqlite3`'s `db.transaction(fn)` callback (which must be synchronous); the async retry path stays in `prepare`.
  - Factored `maybeLoadExtensions()` out of `run`'s `finally` and shared it with `runBatch`, keeping the lazy FTS5/sqlite-vec extension-load invariant identical.
  - `vec0` virtual tables participate in transactions, so a mixed `DELETE`/`INSERT`/`UPDATE` batch on `vec_notes` is atomic.

#### Diagnostic Logging Gate (Settings → Updates → Logging)
- **A single toggle controls all renderer diagnostic `console.log/warn/info` output**:
  - New `utils/logger.ts` leaf util (no store imports → no import cycle; Web-Worker-safe). `readLoggingEnabled()` checks `import.meta.env.DEV` **first** — a compile-time constant, so logging is **forced ON in dev** and the branch is dead code in packaged builds — then reads `localStorage` (`notesnook.loggingEnabled`, default off). `logger.error` **always prints**, so genuine failures still surface in packaged builds with logging off. Reads fresh each call → the Settings toggle takes effect live without a reload.
  - New **Logging** section inside Settings → Updates (toggle locked ON in dev with a "Forced on in development mode" hint; off by default in packaged builds).
- **Migrated all 31 renderer `stores/` + `utils/` files** (incl. both Web Workers) — 172 `console.*` call sites — to `logger.*`, preserving the existing `[tag] …` prefix convention.
- **Vector-search diagnostic logs** (gated) added so Phase B is observable on-site: `[vector-search] indexNoteEmbeddings {noteId, chunks, existing}` → `[vector-search] runSqlBatch flushing {statements: N}` confirms a single batched transactional flush.

#### Verification
- `npm run typecheck --workspace=apps/desktop` (node + web) — clean.
- `npm run test:contract` — **1515/1515 tests pass** across 104 files (new `sqlite-engine` `db.transaction` atomicity + rollback case; `bridge-router` `sqlite.runBatch` shape pin).
- On-site gates pending: packaged-build runtime confirm that a multi-chunk re-index shows one `sqlite.runBatch` flush in the renderer console (Logging is forced ON in dev).

### 🌐 Live Cross-Window Locale Propagation + OS-Native Window Re-Title (Phase 7.2 tail)
- **Cross-window live locale sync**: changing the interface language in the Settings window now updates every other open renderer window (main, note, pane) **live**, without a reload. Mirrors the existing cross-window theme `storage`-event pattern: `setLocale` writes `notesnook.locale` to `localStorage`; other windows' `storage` listener applies it via a new `syncLocale()` that sets the local vue-i18n locale ref only (no re-persist, no re-notify-main → no loop, no redundant main menu/tray rebuild).
- **OS-native window re-title**: the auxiliary Settings and Changelog windows now show localized titles (`window.settings` / `window.whatsNew`) that flip on locale switch. The renderer's static `<title>Notesnook</title>` clobbers the `BrowserWindow` `title:` option once the page parses, so titles are applied via main-process `win.setTitle(tMain(...))` after `did-finish-load` and on locale change through `registerLocaleChangeCallback`. Content (main/note/pane) windows are intentionally untouched.

### 📝 Spellcheck: Multi-Language Picker, Decoupled from App Language
- **Multi-language spellcheck picker** (Settings → Language → Spell check): a scrollable checkbox list of `session.availableSpellCheckerLanguages`, toggled via a new store `toggleLanguage(code)`. Spellcheck now supports several languages at once and is **independent of the interface locale** — run the app in English while spell-checking German + French. The Language section is restructured into two clearly-labeled groups (Interface language / Spell check) with a `spellLanguagesHint`. The backend already supported multi-language (`setLanguages(codes[])` + `resolveEnabledCodes`); only the UI was missing.
- **⚠️ macOS fix — hide the picker**: Electron's `session.setSpellCheckerLanguages` is a **no-op on macOS** (Electron 21+; the native `NSSpellChecker` auto-detects language from macOS system/keyboard languages — you cannot set or persist spellcheck languages via the API). On macOS the non-functional picker is replaced with an explanatory note; the enable toggle still works. The picker only functions on Windows/Linux (Hunspell). Sources: electron/electron #30215, #35508, PR #35514.

### 🎨 Vector Visualizer Theme Adaptation
- **The vector & cluster visualizer canvas now follows the active theme.** Previously the 2D canvas hard-coded dark colors (`#090d16` backdrop, `#f8fafc` near-white labels, `#ffffff` node strokes, `#6366f1` indigo), so the graph was always dark regardless of theme — and on a light theme the white labels/rings were invisible. The chrome (control bar + inspector) already used theme tokens, but a 2D `<canvas>` context can't resolve `var(…)`.
- **New `utils/canvas-theme.ts`** reads the resolved `--background`/`--paragraph`/`--paragraph-secondary`/`--border`/`--accent` from `getComputedStyle(document.documentElement)` (injected by `@notesnook-vue/theme-vue`'s `injectTheme`) into concrete hex strings for `ctx.fillStyle`/`strokeStyle`, with `withAlpha()` for faded strokes and `onThemeChange()` (a `MutationObserver` on `<html data-theme>`) so the graph re-renders **live** on theme switch. Backdrop → `--background`; default note node + selection ring → `--accent`; label text → `--paragraph`/`-secondary`; similarity edges → accent. Cluster titles get a backdrop-colored `strokeText` halo so they stay readable on both backdrops.
- **Categorical palette kept** (legitimate data-encoding, like a chart series palette): `CLUSTER_COLORS` for cluster-identity hulls/labels and the tag/notebook/color type colors (only used for DBSCAN-noise nodes outside a cluster) — vivid mid-tones readable in both themes. Establishes the canvas-theming pattern for any future canvas surface (`NoteMinimap` renders via DOM/CSS and already inherits tokens).

#### Verification
- `npm run typecheck` (node + web) — clean.
- `npm run test:contract` — **1546/1546 tests pass** across 105 files (+10 new `canvas-theme` spec; +5 i18n `syncLocale`; +3 `spell-checker` `toggleLanguage`).
- `npm run build` — clean (6.61s).
- On-site gates pending: cross-window live locale switch; live OS-native window re-title on locale change; spellcheck multi-picker on Windows/Linux + hidden-with-note on macOS; visualizer flips live when switching theme with it open (dark↔light, darkTheme/lightTheme swap, catalog install, cross-window).

## [0.9.1] - 2026-07-27

### 🧠 Vector Search Inference Offloaded to a Web Worker (Phase A)
- **Embedding generation moved off the renderer main thread**:
  - `@huggingface/transformers` (`Xenova/all-MiniLM-L6-v2`, fp32) inference now runs in a dedicated renderer-side Web Worker (`vector-search.worker.ts`) instead of on the main thread, so the ONNX pipeline never blocks UI rendering or input.
  - Eliminates the previously un-gated per-keystroke query-time inference path: `searchVectorEmbeddings` → `computeEmbedding(queryText)` ran synchronous inference on every omnibar keystroke, causing search-input stutter on large notebooks. Search typing is now lag-free.
  - Background indexing (note open / autosave / boot catch-up) likewise stops contending for the main thread; the existing idle-scheduling, activity-gating, and frame-yielding mitigations remain as a second layer.
- **Minimal blast radius**:
  - Only `computeEmbedding`'s body changes — it delegates to a thin promise-RPC worker client (`worker-embedding-client.ts`) and preserves its signature and `readSemanticSearchEnabled` guard. All six call sites are unchanged (query-time search, per-chunk indexing, and the four on-demand embedding paths in the clustering visualizer).
  - The worker is inference-only (text → transferable `Float32Array`); all SQL/IPC writes, the debounced/activity-gated queue, and centroid math stay in the renderer. Web Workers spawned from the Electron renderer run in a pure-web context (no Node), so the worker uses the `onnxruntime-web` WASM backend.
  - The worker is constructed lazily on first `computeEmbedding` call (never at module import), keeping the Node-based vitest contract suite green.
- **Verification**: typecheck (node + web + contracts) clean; 1514 contract tests pass; `electron-vite build` emits the worker chunk and the `ort-wasm-simd-threaded.asyncify-*.wasm` asset, cross-referenced via `new URL(...)`. On-device gates pending: packaged-app runtime WASM fetch, query-time smoothness, background indexing, clustering visualizer label embeddings.

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
