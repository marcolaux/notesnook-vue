Notesnook Vue Desktop
====================

A from-scratch rewrite of the Notesnook desktop frontend, built with Vue 3,
TailwindCSS, Glassmorphism design language, and a VS Code-like multi-window,
multi-tab, split-pane UX.

This project consumes the upstream Notesnook data engine (`@notesnook/core`,
`@notesnook/editor`, `@notesnook/crypto`, `@notesnook/theme`, `@notesnook/ui`,
`@notesnook/sodium`, `@notesnook/streamable-fs`, `@notesnook/common`,
`@notesnook/logger`) as published npm packages, and re-implements the entire
renderer UI in Vue 3 with a fresh, user-friendly design.

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
tests/contract/              Contract tests against @notesnook/core API
```

Backend compatibility
---------------------
Compatibility with the upstream Notesnook data model is enforced by a contract
test suite in `tests/contract/` that runs against the real `@notesnook/core`
API. These tests run in CI on every pull request and on every dependency bump
of `@notesnook/*` packages.

License
-------
GPL-3.0-or-later. Required for compatibility with `@notesnook/core` (GPL-3.0).