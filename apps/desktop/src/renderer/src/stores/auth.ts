import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { User } from "@notesnook-vue/contracts";
import { EV, EVENTS } from "@notesnook-vue/contracts";
import { getDatabase } from "@/platform/bootstrap";

/**
 * Auth store — wraps `@notesnook/core`'s `UserManager` (`db.user.*`) and drives
 * the login screen state machine.
 *
 * Login flow (mirrors `@notesnook/core`'s `UserManager`, verified against
 * `dist/index.js`):
 *  - `authenticateEmail(email)` → returns `additional_data` shaped
 *    `{ primaryMethod?, secondaryMethod?, phoneNumber? }` (the MFA signal —
 *    `primaryMethod` present means MFA is required; type "app" | "sms" |
 *    "email"). The saved token's scope is `mfa` (MFA on) or `mfa_password`
 *    (MFA off).
 *  - Non-MFA: `authenticateEmail` → `authenticatePassword(email, password)`
 *    (finalises: fetchUser → deriveCryptoKey → register device → publishes
 *    `userLoggedIn`).
 *  - MFA: `authenticateEmail` → `authenticateMultiFactorCode(code, method)`
 *    (upgrades token to `mfa_password` scope) → `authenticatePassword`.
 *  - `signup(email, password)` auto-logs-in via `_login`.
 *
 * The gate uses `getUser()` (reads the cached user from KV — offline-safe, no
 * network) rather than `fetchUser()`, so a logged-in user stays logged in
 * offline. `userSessionExpired` / `userUnauthorized` / `userLoggedOut` events
 * flip back to the logged-out state so the login screen returns.
 *
 * Login is optional: `skippedLogin` lets a logged-out user use the app
 * local-only (persisted to `localStorage` so the choice survives a restart);
 * `requestSignIn()` clears it so the Sidebar "Sign in" affordance re-arms the
 * login screen.
 */

export type AuthStatus =
  | "unknown"
  | "logged-out"
  | "logging-in"
  | "mfa"
  | "logged-in"
  | "error";

export interface PendingMfa {
  email: string;
  password: string;
  method: string;
  secondaryMethod?: string;
}

const SKIP_KEY = "notesnook.skippedLogin";

function readSkipped(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSkipped(value: boolean): void {
  try {
    if (value) localStorage.setItem(SKIP_KEY, "1");
    else localStorage.removeItem(SKIP_KEY);
  } catch {
    /* ignore — persistence is best-effort */
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | undefined>(undefined);
  const status = ref<AuthStatus>("unknown");
  const error = ref<string>("");
  const pendingMfa = ref<PendingMfa | null>(null);
  const skippedLogin = ref<boolean>(readSkipped());

  const isLoggedIn = computed(() => status.value === "logged-in");
  /** True when the shell should show (logged in, or local-only via skip). */
  const showShell = computed(() => isLoggedIn.value || skippedLogin.value);

  let eventsBound = false;

  /** Subscribe to externally-driven logout events once. */
  function bindEvents(): void {
    if (eventsBound) return;
    eventsBound = true;
    const onLoggedOut = (): void => {
      user.value = undefined;
      status.value = "logged-out";
      error.value = "";
      pendingMfa.value = null;
      skippedLogin.value = false;
      writeSkipped(false);
    };
    EV.subscribe(EVENTS.userSessionExpired, onLoggedOut);
    EV.subscribe(EVENTS.userUnauthorized, onLoggedOut);
    EV.subscribe(EVENTS.userLoggedOut, onLoggedOut);
  }

  /**
   * Determine the initial auth state from the cached user (offline-safe). Call
   * once after bootstrap. Never throws — on any failure the app falls back to
   * the logged-out (login screen) state so the user is never stuck.
   */
  async function init(): Promise<void> {
    bindEvents();
    try {
      const db = getDatabase();
      const u = await db.user.getUser();
      if (u) {
        user.value = u;
        status.value = "logged-in";
      } else {
        status.value = "logged-out";
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[auth] init failed:", e);
      status.value = "logged-out";
    }
  }

  /** Re-read the user and mark logged-in. Called after every successful auth. */
  async function finalize(): Promise<void> {
    const db = getDatabase();
    const u = await db.user.getUser();
    user.value = u;
    status.value = "logged-in";
    error.value = "";
    skippedLogin.value = false;
    writeSkipped(false);
  }

  /**
   * Sign-in step 1: verify the email. If the account has MFA, stash the
   * pending credentials and move to the `mfa` status (the UI collects the
   * code, then calls `submitMfa`). Otherwise finalise the password login.
   */
  async function login(email: string, password: string): Promise<void> {
    status.value = "logging-in";
    error.value = "";
    pendingMfa.value = null;
    try {
      const db = getDatabase();
      const additional = (await db.user.authenticateEmail(email)) as
        | { primaryMethod?: string; secondaryMethod?: string; phoneNumber?: string }
        | undefined;
      if (additional && additional.primaryMethod) {
        pendingMfa.value = {
          email,
          password,
          method: additional.primaryMethod,
          ...(additional.secondaryMethod
            ? { secondaryMethod: additional.secondaryMethod }
            : {})
        };
        status.value = "mfa";
        return;
      }
      await db.user.authenticatePassword(email, password);
      await finalize();
    } catch (e) {
      status.value = "error";
      error.value = errorMessage(e);
    }
  }

  /** Sign-in step 2 (MFA): verify the code, then complete the password login. */
  async function submitMfa(code: string, method?: string): Promise<void> {
    const pending = pendingMfa.value;
    if (!pending) {
      status.value = "error";
      error.value = "MFA session expired — please start again.";
      return;
    }
    error.value = "";
    try {
      const db = getDatabase();
      await db.user.authenticateMultiFactorCode(code, method ?? pending.method);
      await db.user.authenticatePassword(pending.email, pending.password);
      pendingMfa.value = null;
      await finalize();
    } catch (e) {
      // Stay on the MFA step so the user can re-enter the code.
      status.value = "mfa";
      error.value = errorMessage(e);
    }
  }

  /** Sign up (auto-logs-in via `_login`) and land in the shell. */
  async function signup(email: string, password: string): Promise<void> {
    status.value = "logging-in";
    error.value = "";
    try {
      const db = getDatabase();
      await db.user.signup(email, password);
      await finalize();
    } catch (e) {
      status.value = "error";
      error.value = errorMessage(e);
    }
  }

  /** Log out (revokes the session server-side) and return to the login screen. */
  async function logout(): Promise<void> {
    try {
      const db = getDatabase();
      await db.user.logout();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[auth] logout failed:", e);
    } finally {
      user.value = undefined;
      status.value = "logged-out";
      pendingMfa.value = null;
      skippedLogin.value = false;
      writeSkipped(false);
    }
  }

  /** Local-only mode: skip the login screen, keep using the app offline. */
  function skipLogin(): void {
    skippedLogin.value = true;
    writeSkipped(true);
    status.value = "logged-out";
    error.value = "";
  }

  /** Re-arm the login screen from the Sidebar "Sign in" affordance. */
  function requestSignIn(): void {
    skippedLogin.value = false;
    writeSkipped(false);
  }

  return {
    user,
    status,
    error,
    pendingMfa,
    skippedLogin,
    isLoggedIn,
    showShell,
    init,
    login,
    submitMfa,
    signup,
    logout,
    skipLogin,
    requestSignIn
  };
});