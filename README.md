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
Pre-alpha. Scaffolding in progress.

Repository layout
-----------------
```
apps/desktop/                Electron app
  src/main/                  Main process (Electron)
  src/preload/                Preload scripts (contextBridge)
  src/renderer/               Vue 3 renderer (Vite)
  src/contracts/              tRPC AppRouter contract (mirror of upstream)
packages/contracts/          Shared TypeScript contracts (types re-exports)
packages/shared/             Shared utilities between main & renderer
vendor/notesnook/             Upstream source (git submodule; pinned commit)
vendor-dist/@notesnook/       Built dist committed in-tree (consumed at runtime)
tests/contract/              Contract tests against @notesnook/core API
docs/                        Project docs (see updating-vendor.md)
```

Backend compatibility
---------------------
Compatibility with the upstream Notesnook data model is enforced by a contract
test suite in `tests/contract/` that runs against the real `@notesnook/core`
API. These tests run in CI on every pull request and on every vendor bump. A
`vendor:check` drift guard in CI also verifies the committed `vendor-dist`
matches the pinned submodule commit.

License
-------
GPL-3.0-or-later. Required for compatibility with `@notesnook/core` (GPL-3.0).