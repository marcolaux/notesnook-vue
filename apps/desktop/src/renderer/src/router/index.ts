/**
 * Vue Router (Phase 3.5). Classic route table + `createMemoryHistory`
 * (Electron-standard: no URL bar/server, robust under prod `loadFile`).
 *
 * The auth guard keeps the route in sync with `useAuthStore`:
 *  - while `status === "unknown"` (boot in progress) it allows anything through
 *    — `App.vue` settles the initial route with `router.replace(...)` once
 *    `auth.init()` resolves, and the boot overlay covers the screen meanwhile;
 *  - logged-out (incl. local-only not chosen) → force `/login`;
 *  - logged-in / local-only → block `/login` (bounce to `/all`).
 *
 * `createAppRouter()` is the factory; the exported `router` is the app-wide
 * singleton. Tests build their own instance to avoid shared-history bleed.
 */
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import { routes, RouteName } from "./routes";
import { useAuthStore } from "@/stores/auth";

export function installAuthGuard(router: Router): void {
  router.beforeEach((to) => {
    const auth = useAuthStore();
    if (auth.status === "unknown") return true;
    if (!auth.showShell && to.path !== "/login") return { path: "/login" };
    if (auth.showShell && to.path === "/login") return { path: "/all" };
    // Monographs (the published-notes view) is hidden in local-only mode —
    // publishing is a server call gated on a logged-in account. The sidebar
    // entry + goto command are already hidden; this is defense-in-depth for a
    // stray programmatic / deep-link navigation to `/monographs`.
    if (!auth.isLoggedIn && to.name === RouteName.monographs) return { path: "/all" };
    return true;
  });
}

export function createAppRouter(): Router {
  const router = createRouter({ history: createMemoryHistory(), routes });
  installAuthGuard(router);
  return router;
}

export const router: Router = createAppRouter();