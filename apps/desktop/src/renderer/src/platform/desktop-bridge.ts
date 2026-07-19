/**
 * tRPC client — the renderer's typed handle to the main-process `AppRouter`.
 *
 * `ipcLink()` (from `electron-trpc/renderer`) routes calls over the Electron
 * IPC channel that `exposeElectronTRPC()` set up in the preload. The router
 * type is imported type-only from the shared contract so the router's
 * Node-only dependencies (`@trpc/server`, `zod`) are never bundled into the
 * renderer.
 *
 * Every main-process capability (sqlite, compress, safeStorage, fs, window,
 * updater, …) is reached through this single client as `desktop.<router>.<proc>`.
 *
 * The client is constructed lazily on first property access so that merely
 * importing this module (e.g. in tests, or before the preload has run) does not
 * trigger IPC client creation — which would otherwise require the
 * `electronTRPC` global to be present.
 */
import { createTRPCProxyClient } from "@trpc/client";
import { ipcLink } from "electron-trpc/renderer";
import type { AppRouter } from "@contracts/router";

function createDesktopClient() {
  return createTRPCProxyClient<AppRouter>({ links: [ipcLink()] });
}

export type Desktop = ReturnType<typeof createDesktopClient>;

let client: Desktop | undefined;

function getClient(): Desktop {
  if (!client) {
    client = createDesktopClient();
  }
  return client;
}

/**
 * Lazy proxy: every property access forwards to the real client, which is
 * built on first access. Call sites use it exactly like a normal tRPC client
 * (`desktop.ping.query()`, `desktop.sqlite.run.mutate(...)`).
 */
export const desktop = new Proxy({} as Desktop, {
  get(_target, prop, receiver) {
    const c = getClient();
    const value = Reflect.get(c, prop, receiver);
    return typeof value === "function" ? value.bind(c) : value;
  }
}) as Desktop;