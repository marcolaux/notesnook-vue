/**
 * Loads `electron-trpc` via its CommonJS build.
 *
 * The ESM build (`dist/main.mjs`) does one top-level
 *   `import { ipcMain, contextBridge, ipcRenderer } from "electron"`
 * and those three symbols are never all present in a single Electron process:
 * `ipcRenderer`/`contextBridge` are renderer/preload-only, `ipcMain` is
 * main-only. Under Electron 37's strict ESM `electron` module the missing
 * named export throws at link time, so both the main process (no
 * `ipcRenderer`) and the preload (no `ipcMain`) fail to start with
 * `SyntaxError: The requested module 'electron' does not provide an export
 * named 'ipcRenderer'` (resp. `ipcMain`).
 *
 * The CJS build (`dist/main.cjs`) does `require("electron")` and accesses the
 * symbols as properties, so the missing ones are simply `undefined`. We load
 * it through `createRequire` so the bundler keeps `electron-trpc` external and
 * Node resolves the `require` export condition at runtime.
 *
 * Used by `src/main/ipc.ts` (`createIPCHandler`) and `src/preload/index.ts`
 * (`exposeElectronTRPC`). The renderer-side `ipcLink` from
 * `electron-trpc/renderer` is unaffected (it talks to `window.electronTRPC`,
 * not `electron`).
 */
import { createRequire } from "node:module";

const cjsRequire = createRequire(import.meta.url);
const electronTrpc = cjsRequire("electron-trpc/main") as typeof import("electron-trpc/main");

export const createIPCHandler = electronTrpc.createIPCHandler;
export const exposeElectronTRPC = electronTrpc.exposeElectronTRPC;