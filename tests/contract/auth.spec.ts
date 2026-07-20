/**
 * Contract tests for the login logic: server-config resolution/persistence +
 * the `useAuthStore` state machine (login / MFA / signup / logout / session
 * expiry) against a mocked `Database.user`.
 *
 * Runs under the default `node` env with an in-memory `localStorage` mock
 * (server-config + the store's `skippedLogin` flag persist there). Pinia works
 * in node. `@/platform/bootstrap` is mocked so the store's `getDatabase()`
 * returns a stub `Database` with a `user` whose methods are `vi.fn()`s — we
 * assert the store calls the right `UserManager` methods and transitions
 * through the right statuses, not the network behaviour (that is the on-site
 * runtime-check gate).
 *
 * Note: the `EV`-driven session-expiry → logged-out wiring is NOT unit-tested
 * here. Under vitest, the store (imported via `@/stores/auth`) and the test
 * receive different `@notesnook-vue/contracts` module instances, so a pub/sub
 * round-trip can't be observed from the test. The handler runs the same state
 * resets as `logout()` (which is tested below); the live event wiring is
 * verified at the on-site runtime check.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  readServerConfig,
  writeServerConfig,
  resolveHosts,
  isValidConfig,
  defaultHosts,
  type Hosts
} from "@/platform/server-config";
import { hosts as coreHosts } from "@notesnook-vue/contracts";
import { PRODUCTION_HOSTS } from "@/platform/production-hosts.generated";
import { switchContext } from "@/platform/bootstrap";
import {
  readCurrentContext,
  writeCurrentContext,
  LOCAL_CONTEXT
} from "@/platform/account-context";

// `vi.hoisted` so the mock factory (hoisted above imports) can reach the
// mutable db ref without a TDZ violation. Also installs a global `localStorage`
// shim before the store module loads — the store reads `skippedLogin` from
// `localStorage` at module-init time, and node has no `localStorage` by default
// (accessing it prints an experimental-warning); the shim silences that. The
// same shim class is reused per-test in `beforeEach` for isolation.
const { mockDbRef, MemLocalStorage } = vi.hoisted(() => {
  class MemLocalStorage {
    private m = new Map<string, string>();
    getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
    setItem(k: string, v: string): void { this.m.set(k, String(v)); }
    removeItem(k: string): void { this.m.delete(k); }
    clear(): void { this.m.clear(); }
  }
  if (!(globalThis as any).localStorage) (globalThis as any).localStorage = new MemLocalStorage();
  return { mockDbRef: { db: null as any }, MemLocalStorage };
});

vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => mockDbRef.db,
  // `auth.login` live-swaps to the account DB before authenticating. In tests
  // the mock db is already installed, so a no-op swap keeps the same db.
  switchContext: vi.fn(async () => undefined)
}));

import { useAuthStore } from "@/stores/auth";

/** Build a fresh stub `Database` with a `user` whose methods are spies. */
function makeMockDb(opts: { user?: any; mfaAdditional?: any } = {}) {
  const storedUser = opts.user ?? undefined;
  const mfaAdditional = opts.mfaAdditional;
  return {
    user: {
      getUser: vi.fn(async () => storedUser),
      authenticateEmail: vi.fn(async () => mfaAdditional),
      authenticatePassword: vi.fn(async () => undefined),
      authenticateMultiFactorCode: vi.fn(async () => true),
      signup: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined)
    }
  };
}

const sampleUser = {
  id: "u1",
  email: "a@b.com",
  isEmailConfirmed: true,
  salt: "s",
  mfa: { isEnabled: false, primaryMethod: "app", remainingValidCodes: 0 },
  subscription: {
    appId: 0, cancelURL: null, expiry: 0, productId: "p", provider: 0,
    start: 0, type: 0, updateURL: null
  }
};

let savedLocalStorage: any;

beforeEach(() => {
  vi.clearAllMocks();
  savedLocalStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = new MemLocalStorage();
  setActivePinia(createPinia());
  mockDbRef.db = makeMockDb();
});

afterEach(() => {
  (globalThis as any).localStorage = savedLocalStorage;
});

describe("server-config", () => {
  it("defaults to the notesnook profile", () => {
    const cfg = readServerConfig();
    expect(cfg.profile).toBe("notesnook");
  });

  it("resolves the notesnook profile to the default hosts", () => {
    const h = resolveHosts({ profile: "notesnook" });
    expect(h.API_HOST).toBe(defaultHosts().API_HOST);
    expect(h.AUTH_HOST).toBe(defaultHosts().AUTH_HOST);
    // The host set is whatever the pinned core exports (derived dynamically in
    // server-config); just assert it round-trips the full default bag intact.
    expect(Object.keys(h).sort()).toEqual(Object.keys(defaultHosts()).sort());
  });

  // Safety net: the generated `PRODUCTION_HOSTS` (codegenned from the upstream
  // `hosts` production branch) MUST match core's runtime `hosts`. Under vitest
  // `NODE_ENV=test`, core's `isProduction()` is true so `hosts` resolves to the
  // production branch — i.e. the same values the generator extracted. If a
  // submodule bump regenerates vendor-dist's `hosts` but the generated file is
  // forgotten (or vice-versa), this fails CI loudly instead of silently pointing
  // the default profile at stale/wrong URLs.
  it("PRODUCTION_HOSTS stays in sync with core's runtime hosts", () => {
    expect(PRODUCTION_HOSTS).toEqual(coreHosts);
  });

  it("merges a custom profile over the defaults", () => {
    const custom: Hosts = { ...defaultHosts(), API_HOST: "https://api.example.com" };
    writeServerConfig({ profile: "custom", hosts: custom });
    const cfg = readServerConfig();
    expect(cfg.profile).toBe("custom");
    if (cfg.profile === "custom") {
      const h = resolveHosts(cfg);
      expect(h.API_HOST).toBe("https://api.example.com");
      expect(h.AUTH_HOST).toBe(defaultHosts().AUTH_HOST); // untouched
    }
  });

  it("round-trips a custom config through localStorage", () => {
    const custom: Hosts = {
      ...defaultHosts(),
      API_HOST: "https://api.example.com",
      AUTH_HOST: "https://auth.example.com",
      SSE_HOST: "https://events.example.com",
      SUBSCRIPTIONS_HOST: "https://sub.example.com",
      ISSUES_HOST: "https://issues.example.com"
    };
    writeServerConfig({ profile: "custom", hosts: custom });
    const cfg = readServerConfig();
    expect(cfg.profile).toBe("custom");
    if (cfg.profile === "custom") {
      expect(cfg.hosts).toEqual(custom);
    }
  });

  it("falls back to notesnook on malformed persisted JSON", () => {
    localStorage.setItem("notesnook.serverConfig", "{not json");
    expect(readServerConfig().profile).toBe("notesnook");
  });

  it("isValidConfig rejects a custom profile with missing/invalid hosts", () => {
    expect(isValidConfig({ profile: "custom", hosts: { API_HOST: "nope" } })).toBe(false);
    expect(isValidConfig({ profile: "custom" })).toBe(false);
    expect(isValidConfig({ profile: "weird" })).toBe(false);
    expect(isValidConfig({ profile: "notesnook" })).toBe(true);
    expect(isValidConfig(null)).toBe(false);
  });
});

describe("auth store", () => {
  it("init → logged-out when there is no cached user", async () => {
    mockDbRef.db = makeMockDb({ user: undefined });
    const auth = useAuthStore();
    await auth.init();
    expect(auth.status).toBe("logged-out");
    expect(auth.isLoggedIn).toBe(false);
    expect(auth.showShell).toBe(false);
  });

  it("init → logged-in when a cached user exists (offline-safe, no network)", async () => {
    mockDbRef.db = makeMockDb({ user: sampleUser });
    const auth = useAuthStore();
    await auth.init();
    expect(auth.status).toBe("logged-in");
    expect(auth.user?.email).toBe("a@b.com");
    expect(mockDbRef.db.user.getUser).toHaveBeenCalledTimes(1);
  });

  it("login (non-MFA) → switches to account DB, authenticates, signals context change", async () => {
    // authenticateEmail returns no primaryMethod ⇒ non-MFA.
    mockDbRef.db = makeMockDb({ mfaAdditional: {} });
    const auth = useAuthStore();
    await auth.init();
    const before = auth.contextChangeSignal;
    await auth.login("a@b.com", "password1");
    // Login switches to the account's own DB before authenticating.
    expect(switchContext).toHaveBeenCalledTimes(1);
    expect(mockDbRef.db.user.authenticateEmail).toHaveBeenCalledWith("a@b.com");
    expect(mockDbRef.db.user.authenticatePassword).toHaveBeenCalledWith("a@b.com", "password1");
    expect(auth.status).toBe("logged-in");
    expect(auth.pendingMfa).toBeNull();
    // Success persists the account context + bumps the signal (no page reload).
    expect(readCurrentContext()).not.toBe(LOCAL_CONTEXT);
    expect(auth.contextChangeSignal).toBe(before + 1);
  });

  it("login (MFA) → enters mfa status with pending method, then submitMfa completes", async () => {
    mockDbRef.db = makeMockDb({
      mfaAdditional: { primaryMethod: "app", secondaryMethod: "email" }
    });
    const auth = useAuthStore();
    await auth.init();
    const before = auth.contextChangeSignal;
    await auth.login("a@b.com", "password1");
    expect(auth.status).toBe("mfa");
    expect(auth.pendingMfa).toEqual(
      expect.objectContaining({
        email: "a@b.com",
        password: "password1",
        method: "app",
        secondaryMethod: "email"
      })
    );
    // Password must NOT have been sent yet — waiting for the code. No context
    // change yet either (the MFA step hasn't completed).
    expect(mockDbRef.db.user.authenticatePassword).not.toHaveBeenCalled();
    expect(auth.contextChangeSignal).toBe(before);

    await auth.submitMfa("123456");
    expect(mockDbRef.db.user.authenticateMultiFactorCode).toHaveBeenCalledWith("123456", "app");
    expect(mockDbRef.db.user.authenticatePassword).toHaveBeenCalledWith("a@b.com", "password1");
    expect(auth.status).toBe("logged-in");
    expect(auth.pendingMfa).toBeNull();
    expect(auth.contextChangeSignal).toBe(before + 1);
  });

  it("submitMfa without a pending session surfaces an error and stays reachable", async () => {
    const auth = useAuthStore();
    await auth.init();
    await auth.submitMfa("123456");
    expect(auth.status).toBe("error");
    expect(auth.error).toMatch(/MFA session expired/i);
  });

  it("signup → switches to account DB, signs up, signals context change", async () => {
    mockDbRef.db = makeMockDb({ user: sampleUser });
    const auth = useAuthStore();
    await auth.init();
    const before = auth.contextChangeSignal;
    await auth.signup("a@b.com", "password1");
    expect(switchContext).toHaveBeenCalledTimes(1);
    expect(mockDbRef.db.user.signup).toHaveBeenCalledWith("a@b.com", "password1");
    expect(auth.status).toBe("logged-in");
    expect(readCurrentContext()).not.toBe(LOCAL_CONTEXT);
    expect(auth.contextChangeSignal).toBe(before + 1);
  });

  it("logout → live-swaps to local context + signals (does NOT wipe via db.user.logout)", async () => {
    mockDbRef.db = makeMockDb({ user: sampleUser });
    // Simulate being logged into an account (current context = an account).
    writeCurrentContext("abcd1234abcd1234");
    const auth = useAuthStore();
    await auth.init();
    expect(auth.isLoggedIn).toBe(true);
    const before = auth.contextChangeSignal;
    await auth.logout();
    // Logout is non-destructive: it live-swaps to the local DB + signals so
    // App.vue reloads local notes. Core's db.user.logout (which wipes the DB)
    // is deliberately NOT called; the account DB + token stay intact.
    expect(switchContext).toHaveBeenCalledWith(LOCAL_CONTEXT);
    expect(mockDbRef.db.user.logout).not.toHaveBeenCalled();
    expect(auth.status).toBe("logged-out");
    expect(auth.user).toBeUndefined();
    expect(readCurrentContext()).toBe(LOCAL_CONTEXT);
    expect(auth.contextChangeSignal).toBe(before + 1);
  });

  it("login failure → error status with message", async () => {
    mockDbRef.db = makeMockDb({ mfaAdditional: {} });
    mockDbRef.db.user.authenticatePassword = vi.fn(async () => {
      throw new Error("Invalid credentials");
    });
    const auth = useAuthStore();
    await auth.init();
    await auth.login("a@b.com", "wrong");
    expect(auth.status).toBe("error");
    expect(auth.error).toBe("Invalid credentials");
  });

  it("skipLogin → shell shows while logged-out; requestSignIn re-arms the login screen", async () => {
    mockDbRef.db = makeMockDb({ user: undefined });
    const auth = useAuthStore();
    await auth.init();
    expect(auth.showShell).toBe(false);
    auth.skipLogin();
    expect(auth.skippedLogin).toBe(true);
    expect(auth.showShell).toBe(true);
    // Persists.
    expect(localStorage.getItem("notesnook.skippedLogin")).toBe("1");
    auth.requestSignIn();
    expect(auth.skippedLogin).toBe(false);
    expect(auth.showShell).toBe(false);
    expect(localStorage.getItem("notesnook.skippedLogin")).toBeNull();
  });
});