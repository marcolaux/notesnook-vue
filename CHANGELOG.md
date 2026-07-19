# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial repository scaffolding.
- Monorepo layout: `apps/desktop`, `packages/contracts`, `packages/shared`.
- Electron main process with frameless, vibrancy-enabled BrowserWindow.
- Preload bridge exposing `appEvents` + `os` via contextBridge.
- tRPC `AppRouter` contract mirroring upstream `apps/desktop`.
- Vue 3 renderer shell: TitleBar, Sidebar, NotesList, Editor placeholder.
- Pinia `notes` store stub.
- TailwindCSS v4 wired with glassmorphism placeholder tokens.
- Contract test suite against `@notesnook/core` public surface.
- TypeScript project references (`tsconfig.node.json`, `tsconfig.web.json`).