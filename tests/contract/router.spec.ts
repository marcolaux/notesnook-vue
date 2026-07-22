import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// The auth store (pulled in by the router guard) imports `getDatabase` from the
// platform seam; stub it so the sodium/crypto/bridge graph isn't loaded for a
// pure router-logic test (same pattern as command-palette.spec).
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => ({}),
  bootstrap: vi.fn()
}));

import { createAppRouter } from "@/router";
import { routes, VIEWS, RouteName, topViews, bottomViews } from "@/router/routes";
import { useAuthStore } from "@/stores/auth";
// Importing app-commands registers the app + `app:goto-*` palette commands.
import "@/commands/app-commands";
import { setCommandRouter, getCommands, type CommandContext } from "@/commands/registry";

function setAuthStatus(
  status: "unknown" | "logged-out" | "logged-in",
  opts: { skipped?: boolean } = {}
): void {
  const auth = useAuthStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (auth as any).status = status;
  (auth as any).skippedLogin = !!opts.skipped;
}

describe("router routes", () => {
  it("every VIEWS entry has a matching named route", () => {
    const names = new Set(routes.flatMap(flattenNames));
    for (const v of VIEWS) {
      expect(names.has(v.name)).toBe(true);
    }
  });

  it("top/bottom partition matches the sidebar placement", () => {
    expect(topViews.map((v) => v.name)).toEqual([
      RouteName.all,
      RouteName.notebooks,
      RouteName.tags,
      RouteName.monographs,
      RouteName.archive,
      RouteName.reminders
    ]);
    expect(bottomViews.map((v) => v.name)).toEqual([RouteName.trash, RouteName.settings]);
  });

  it("redirects `/` to `/all`", async () => {
    setActivePinia(createPinia());
    setAuthStatus("logged-in");
    const router = createAppRouter();
    await router.replace("/");
    expect(router.currentRoute.value.path).toBe("/all");
  });

  it("resolves a named route by RouteName", () => {
    const router = createAppRouter();
    expect(router.resolve({ name: RouteName.trash }).path).toBe("/trash");
    expect(router.resolve({ name: RouteName.settings }).path).toBe("/settings");
  });
});

describe("router auth guard", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("unknown status (boot in progress) allows any route", async () => {
    setAuthStatus("unknown");
    const router = createAppRouter();
    await router.replace("/notebooks");
    expect(router.currentRoute.value.path).toBe("/notebooks");
  });

  it("logged-out redirects non-login routes to /login", async () => {
    setAuthStatus("logged-out");
    const router = createAppRouter();
    await router.replace("/all");
    expect(router.currentRoute.value.path).toBe("/login");
    await router.replace("/trash");
    expect(router.currentRoute.value.path).toBe("/login");
  });

  it("logged-in blocks /login (bounces to /all)", async () => {
    setAuthStatus("logged-in");
    const router = createAppRouter();
    await router.replace("/login");
    expect(router.currentRoute.value.path).toBe("/all");
  });

  it("local-only (logged-out + skipped) shows the shell and blocks /login", async () => {
    setAuthStatus("logged-out", { skipped: true });
    expect(useAuthStore().showShell).toBe(true);
    const router = createAppRouter();
    await router.replace("/login");
    expect(router.currentRoute.value.path).toBe("/all");
    await router.replace("/trash");
    expect(router.currentRoute.value.path).toBe("/trash");
  });

  it("logging out mid-session bounces subsequent navigation to /login", async () => {
    setAuthStatus("logged-in");
    const router = createAppRouter();
    await router.replace("/all");
    expect(router.currentRoute.value.path).toBe("/all");
    setAuthStatus("logged-out");
    // Navigate to a *different* route so the guard actually runs (replacing to
    // the current route is a deduped no-op). The guard now sees logged-out →
    // bounces to /login.
    await router.replace("/trash");
    expect(router.currentRoute.value.path).toBe("/login");
  });
});

describe("goto palette commands", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("registers one goto command per navigable VIEWS entry (Settings excluded)", () => {
    // Settings opens its own window via `app:open-settings`, not a goto route.
    const ids = getCommands()
      .filter((c) => c.id.startsWith("app:goto-"))
      .map((c) => c.id)
      .sort();
    const expected = VIEWS.filter((v) => v.name !== "settings")
      .map((v) => `app:goto-${v.name}`)
      .sort();
    expect(ids).toEqual(expected);
  });

  it("registers an app:open-settings command that opens the settings window", () => {
    const cmd = getCommands().find((c) => c.id === "app:open-settings");
    expect(cmd).toBeDefined();
    expect(cmd?.when?.(stubCtx({ showShell: false }))).toBe(false);
    expect(cmd?.when?.(stubCtx({ showShell: true }))).toBe(true);
  });

  it("goto-trash is hidden when logged-out and navigates when logged-in", async () => {
    setAuthStatus("logged-out");
    const hidden = getCommands().find((c) => c.id === "app:goto-trash");
    expect(hidden?.when?.(stubCtx({ showShell: false }))).toBe(false);

    setAuthStatus("logged-in");
    const router = createAppRouter();
    setCommandRouter(router);
    await router.replace("/all");
    const cmd = getCommands().find((c) => c.id === "app:goto-trash");
    expect(cmd).toBeTruthy();
    cmd!.run(stubCtx({ showShell: true }, router));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/trash"));
  });
});

/** Flatten a route record's own name + its children's names. */
function flattenNames(r: { name?: unknown; children?: unknown[] }): unknown[] {
  const own = r.name ? [r.name] : [];
  const kids = Array.isArray(r.children) ? r.children.flatMap(flattenNames) : [];
  return [...own, ...kids];
}

/** Minimal CommandContext for `when`/`run` (only the fields the goto commands use). */
function stubCtx(opts: { showShell: boolean }, router?: unknown): CommandContext {
  return {
    editor: undefined,
    notes: undefined as unknown as CommandContext["notes"],
    auth: { showShell: opts.showShell } as unknown as CommandContext["auth"],
    shell: undefined as unknown as CommandContext["shell"],
    sync: undefined as unknown as CommandContext["sync"],
    updater: undefined as unknown as CommandContext["updater"],
    spellChecker: undefined as unknown as CommandContext["spellChecker"],
    router: (router ?? undefined) as CommandContext["router"],
    closePalette: () => {}
  };
}