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
 *
 * The tRPC client is itself a callable recursive proxy (each property access
 * returns another callable proxy). It must be forwarded VERBATIM — do NOT
 * `.bind()` it: `proxy.bind` is intercepted by the tRPC proxy's own `get`
 * trap, so `value.bind(c)` dispatches a tRPC call with path `["bind"]`,
 * `clientCallTypeToProcedureType("bind")` becomes `undefined`, and the call
 * throws `client[procedureType] is not a function`.
 */
export const desktop = new Proxy({} as Desktop, {
  get(_target, prop) {
    return Reflect.get(getClient(), prop);
  }
}) as Desktop;