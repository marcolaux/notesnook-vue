Notesnook Vue Desktop
====================

A from-scratch rewrite of the Notesnook desktop frontend, built with Vue 3,
TailwindCSS, Glassmorphism design language, and a VS Code-like multi-window,
multi-tab, split-pane UX.

This project vendors the upstream Notesnook data engine (`@notesnook/core`,
`@notesnook/editor`, `@notesnook/crypto`, `@notesnook/theme`, `@notesnook/sodium`,
`@notesnook/streamable-fs`, `@notesnook/logger`) directly from source and
re-implements the entire renderer UI in Vue 3 with a fresh, user-friendly
design. The upstream source lives in the `vendor/notesnook` git submodule; the
built dist consumed by the app is committed under `vendor-dist/@notesnook/*`
so `npm install`, `npm run dev`, and CI work without building from source. See
[`docs/updating-vendor.md`](docs/updating-vendor.md) for how to track and bump
upstream.

Status
------
Pre-alpha. The renderer, main process, and contract test suite are
functional; the full upstream feature set is still being filled in. See
"Features" below for what is implemented.

Features
--------
**Editor & layout**
- Multi-window, multi-tab, split-pane UX (recursive `SplitLayout` + sashes;
  cross-pane drag-move/split; empty-pane collapse).
- Per-tab `TipTap` editor with `<KeepAlive>`; per-tab find/replace (`Cmd+F`).
- Collapsible sidebar/notes-list (animated width transition); resizable panes.
- Ephemeral draft editor (empty editor creates a note on typing pause).
- Inline `#tag` mention picker → chip node + tag assignment, two-way synced.
- Task-list visual indent (`Tab`/`Shift+Tab`); attachment drag/paste/insert.
- Table of contents extraction; per-tab note-history timeline with diff.
- Spell-checker (global Electron `session` spellcheck).

**Search & navigation**
- Unified omnibar in the title bar (`useOmnibarStore` + `GlobalSearchInput` +
  `OmnibarDropdown`) subsuming search and command palette. Prefix modes:
  notes / `>` commands / `#` tags / `@` notebooks / `:` recent tabs.
  `Cmd+K` → commands, `Cmd+Alt+F` → notes.
- Full-text search over `@notesnook/core` (FTS5/BM25) with scroll-to-match and
  reuse of existing tabs.

**Notes, notebooks & tags**
- File-manager-style multi-selection in the notes list (separate from the
  active note); bulk pin/archive/trash/color/tag/notebook via submenus.
- Sidebar collections: Notebooks (with sub-notebooks via `db.relations`),
  Tags, Colors, Shortcuts, Archive, Trash — with manual sort.
- Properties pane: tags, notebooks, colors, reminders, publish, note history,
  live stats.
- Custom per-notebook icons (synced `db.settings` row); colors store.

**Sync & cross-device**
- Per-account encrypted SQLite databases; live-swap on login, non-destructive
  on logout; sync-on-login + reload-on-sync.
- Cross-device auto-sync over SSE (`triggerSync` → `databaseSyncRequested`
  → host `db.sync()`) via `@microsoft/fetch-event-source` header-aware event
  source; open notes live-reload on remote edits.
- Cross-window note-change broadcast; vault store (locked notes).

**Monographs (publish to web)**
- Publish dialog + "Published" badge + note context menu + `MonographsView`
  (`/monographs`). Publish URL is the server-returned `Monograph.publishUrl`
  (upstream parity).

**System integration (Electron main)**
- Auto-updater, system tray, deep links (`nn://`), OS notification scheduler
  for reminders, custom titlebar, spell-checker.
- Backup & export (`.nnbackup`); per-account session persistence
  (`userData/session.json`).
- Upstream-release notifier (daily GitHub check → status badge when a desktop
  release is newer than the vendored one).

**i18n & theming**
- `vue-i18n` foundation (migration of the legacy React-coupled
  `@notesnook/intl` deferred); glassmorphism theme with forced dark acrylic.

Backend compatibility
---------------------
Compatibility with the upstream Notesnook data model is enforced by a contract
test suite in `tests/contract/` that runs against the real `@notesnook/core`
API. These tests run in CI on every pull request and on every vendor bump. A
`vendor:check` drift guard in CI also verifies the committed `vendor-dist`
matches the pinned submodule commit.

Repository layout
-----------------
```
apps/desktop/                Electron app
  src/main/                  Main process (Electron)
  src/preload/                Preload scripts (contextBridge)
  src/renderer/src/           Vue 3 renderer (Vite)
    stores/                   Pinia-style stores (sync, notes, editor-layout, …)
    components/  composables/  commands/  editor/  platform/  router/  utils/
  src/contracts/              tRPC AppRouter contract (mirror of upstream)
packages/contracts/          Shared TypeScript contracts (types re-exports)
packages/shared/             Shared utilities between main & renderer
packages/{editor-vue,ui-vue,theme-vue}   Vue ports of upstream editor/UI/theme
vendor/notesnook/            Upstream source (git submodule; pinned commit)
vendor-dist/@notesnook/      Built dist committed in-tree (consumed at runtime)
tests/contract/             Contract tests against @notesnook/core API
scripts/                    Vendor bump/check, host + baseline codegen
docs/                       Project docs (see updating-vendor.md)
```

Getting started
---------------
Requires Node `>=20` and a git checkout with submodules:

```bash
git clone --recurse-submodules <repo>
npm install        # workspace install; vendor dist is committed, no build needed
npm run dev        # runs predev electron-rebuild for the native SQLite module
npm run test:contract   # contract tests against @notesnook/core
npm run typecheck
npm run build
```

To bump or verify the vendored engine, see
[`docs/updating-vendor.md`](docs/updating-vendor.md) and the `vendor:bump` /
`vendor:check` scripts.

License
-------
GPL-3.0-or-later. Required for compatibility with `@notesnook/core` (GPL-3.0).