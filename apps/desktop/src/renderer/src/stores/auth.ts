import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { User } from "@notesnook-vue/contracts";
import { EV, EVENTS } from "@notesnook-vue/contracts";
import { getDatabase, switchContext } from "@/platform/bootstrap";
import { LOCAL_USER_EMAIL } from "@/platform/local-user";
import { getAppState, setAppState } from "@/platform/app-state";
import {
  hashEmail,
  readCurrentContext,
  writeCurrentContext,
  LOCAL_CONTEXT,
  type ContextId
} from "@/platform/account-context";
import { logger } from "@/utils/logger";

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
  /** The account context id being authenticated into (for completing login). */
  ctx: ContextId;
}

const SKIP_KEY = "notesnook.skippedLogin";

function readSkipped(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSkippedLocal(value: boolean): void {
  try {
    if (value) localStorage.setItem(SKIP_KEY, "1");
    else localStorage.removeItem(SKIP_KEY);
  } catch {
    /* ignore — persistence is best-effort */
  }
}

/**
 * Persist the skip flag to renderer `localStorage` (fast, synchronous — the
 * store reads it back at construction) AND mirror it to the main-process
 * `userData/app-state.json` store (durable — survives renderer localStorage
 * loss on hard quit / origin drift, which is what re-showed the login screen
 * on restart in local mode). The main mirror is fire-and-forget; localStorage
 * is still authoritative-fast for the session, and `init()` reconciles from
 * main at boot (main wins when present). Never throws.
 */
function writeSkipped(value: boolean): void {
  writeSkippedLocal(value);
  void setAppState({ skippedLogin: value });
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
  /**
   * Bumped whenever the active context changes (login into an account, logout
   * to local mode). `App.vue` watches it to reload notes/collections from the
   * now-current database and (when logged in) start a sync — without relying
   * on a page reload (which proved unreliable mid-session). The live-swap in
   * `switchContext` has already made `getDatabase()` return the new context's
   * DB by the time this bumps.
   */
  const contextChangeSignal = ref(0);

  const isLoggedIn = computed(() => status.value === "logged-in");
  /** True when the shell should show (logged in, or local-only via skip). */
  const showShell = computed(() => isLoggedIn.value || skippedLogin.value);

  let eventsBound = false;

  /** Subscribe to externally-driven logout events once. */
  function bindEvents(): void {
    if (eventsBound) return;
    eventsBound = true;
    // `cause` carries the event payload core publishes on some of these
    // (`userUnauthorized` → the failing url; `userLoggedOut` → a reason). Accepted
    // but not acted on — kept for a diagnostic trace so the next recurrence of
    // "local mode re-shows login on restart" can be pinned to the real event.
    const onLoggedOut = (cause?: unknown): void => {
      const wasLoggedIn = status.value === "logged-in";
      // eslint-disable-next-line no-console
      logger.warn("[auth] logout event cleared session:", {
        cause,
        wasLoggedIn,
        skipped: skippedLogin.value
      });
      user.value = undefined;
      status.value = "logged-out";
      error.value = "";
      pendingMfa.value = null;
      // Only de-arm the local-mode skip flag when a real account session was
      // active. In local mode `status` is "logged-out" and `skippedLogin` is the
      // sole login gate — these events are spurious there (no server session to
      // expire), and clearing the flag persists to localStorage, so the next
      // restart would re-show the login screen. When a real account session
      // expires, `skippedLogin` is already `false` (set on `finalize`/
      // `completeLogin`), so clearing it here is a no-op and `status` flips to
      // logged-out → the login screen shows, which is correct.
      if (wasLoggedIn) {
        skippedLogin.value = false;
        writeSkipped(false);
      }
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
      // A real (server-authenticated) user → logged in. The synthesised *local*
      // user (sentinel email, created by `ensureLocalUser` so `db.attachments`
      // has a master key in local mode) is NOT a login — treat it as logged-out
      // so the login screen / "Sign in" affordance / no-auto-sync behaviour of
      // local mode is unchanged. `skippedLogin` (read from localStorage) still
      // gates `showShell` independently.
      if (u && u.email !== LOCAL_USER_EMAIL) {
        user.value = u;
        status.value = "logged-in";
      } else {
        status.value = "logged-out";
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[auth] init failed:", e);
      status.value = "logged-out";
    }
    // Reconcile the local-mode skip flag with the durable main-side store
    // (`userData/app-state.json`). In local mode `skippedLogin` is the SOLE
    // login gate, and it previously lived only in renderer localStorage —
    // which a hard quit / dev-origin drift could lose, re-showing the login
    // screen on restart. Main is AUTHORITATIVE when it has a value: a lost
    // localStorage (reads false at store construction) is restored to the
    // persisted choice. When main has no value (fresh install, or a pre-
    // migration install from the localStorage-only era) the localStorage
    // value read at construction stands. Runs before the boot route settle,
    // so the shell/login decision uses the reconciled value. Never throws —
    // `getAppState` already swallows IPC failures.
    const saved = await getAppState();
    if (typeof saved.skippedLogin === "boolean") {
      skippedLogin.value = saved.skippedLogin;
      writeSkippedLocal(saved.skippedLogin);
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
   * Persist the account context and signal the change so `App.vue` reloads
   * notes/collections from the account DB and starts a sync. No page reload —
   * the live-swap already made the account DB the current `Database`, and a
   * reload proved unreliable mid-session. Called after a successful
   * login/signup/MFA completion.
   */
  function completeLogin(accountCtx: ContextId): void {
    writeCurrentContext(accountCtx);
    contextChangeSignal.value += 1;
  }

  const resendStatus = ref<string>("");

  /**
   * Request the server to dispatch a 2FA verification code (via email or SMS).
   */
  async function sendMfaCode(method: string): Promise<boolean> {
    try {
      const db = getDatabase();
      const mfaManager =
        (db as unknown as { mfa?: { sendCode(m: string): Promise<unknown> } }).mfa ??
        (db.user as unknown as { mfa?: { sendCode(m: string): Promise<unknown> } }).mfa;
      if (mfaManager?.sendCode) {
        await mfaManager.sendCode(method);
        return true;
      }
      return false;
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[auth] failed to send MFA code:", e);
      throw e;
    }
  }

  /**
   * Sign-in step 1: switch to the account's own DB, then verify the email. The
   * context switch happens *before* any auth call so the MFA-scope token (and
   * final token) land in the account DB — the local DB is never authenticated,
   * which keeps local and account data strictly separate. If the account has
   * MFA, stash the pending credentials + context and move to the `mfa` status
   * (the UI collects the code, then calls `submitMfa`). Otherwise finalise the
   * password login and reload into the account.
   */
  async function login(email: string, password: string): Promise<void> {
    status.value = "logging-in";
    error.value = "";
    resendStatus.value = "";
    pendingMfa.value = null;
    try {
      const accountCtx = await hashEmail(email);
      if (readCurrentContext() !== accountCtx) {
        await switchContext(accountCtx);
      }
      const db = getDatabase();
      const additional = (await db.user.authenticateEmail(email)) as
        | { primaryMethod?: string; secondaryMethod?: string; phoneNumber?: string }
        | undefined;
      if (additional && additional.primaryMethod) {
        const method = additional.primaryMethod;
        pendingMfa.value = {
          email,
          password,
          method,
          ctx: accountCtx,
          ...(additional.secondaryMethod
            ? { secondaryMethod: additional.secondaryMethod }
            : {})
        };
        status.value = "mfa";

        // Trigger 2FA email/SMS dispatch when required
        if (method === "email" || method === "sms") {
          try {
            await sendMfaCode(method);
            resendStatus.value = `Verification code sent to your ${method === "email" ? "email address" : "phone"}.`;
          } catch (sendErr) {
            error.value = `Failed to send 2FA code: ${errorMessage(sendErr)}`;
          }
        }
        return;
      }
      await db.user.authenticatePassword(email, password);
      await finalize();
      completeLogin(accountCtx);
    } catch (e) {
      status.value = "error";
      error.value = errorMessage(e);
    }
  }

  /** Resend the 2FA code via email/SMS for the current pending MFA session. */
  async function resendMfaCode(methodOverride?: string): Promise<void> {
    const pending = pendingMfa.value;
    if (!pending) {
      error.value = "MFA session expired — please start again.";
      return;
    }
    const method = methodOverride ?? pending.method;
    error.value = "";
    resendStatus.value = "";
    try {
      await sendMfaCode(method);
      resendStatus.value = `New verification code sent to your ${method === "email" ? "email address" : "phone"}.`;
    } catch (e) {
      error.value = `Failed to resend 2FA code: ${errorMessage(e)}`;
    }
  }

  /** Switch between primary and secondary MFA methods. */
  async function switchMfaMethod(newMethod: string): Promise<void> {
    const pending = pendingMfa.value;
    if (!pending) return;
    const oldMethod = pending.method;
    if (newMethod === oldMethod) return;

    pending.method = newMethod;
    pending.secondaryMethod = oldMethod;
    error.value = "";
    resendStatus.value = "";

    if (newMethod === "email" || newMethod === "sms") {
      try {
        await sendMfaCode(newMethod);
        resendStatus.value = `Verification code sent to your ${newMethod === "email" ? "email address" : "phone"}.`;
      } catch (e) {
        error.value = `Failed to send 2FA code: ${errorMessage(e)}`;
      }
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
      const ctx = pending.ctx;
      pendingMfa.value = null;
      await finalize();
      completeLogin(ctx);
    } catch (e) {
      // Stay on the MFA step so the user can re-enter the code.
      status.value = "mfa";
      error.value = errorMessage(e);
    }
  }

  /** Sign up into the account's own DB (auto-logs-in) and reload into it. */
  async function signup(email: string, password: string): Promise<void> {
    status.value = "logging-in";
    error.value = "";
    try {
      const accountCtx = await hashEmail(email);
      if (readCurrentContext() !== accountCtx) {
        await switchContext(accountCtx);
      }
      const db = getDatabase();
      await db.user.signup(email, password);
      await finalize();
      completeLogin(accountCtx);
    } catch (e) {
      status.value = "error";
      error.value = errorMessage(e);
    }
  }

  /**
   * Log out of an account and return to the login screen. Does NOT call core's
   * `db.user.logout()` (that wipes the DB via `db.reset()`) — instead it
   * live-swaps the database back to the local context so the account DB + its
   * token stay intact for a future account switcher / re-login, and signals the
   * change so `App.vue` reloads the local notes behind the login screen.
   * `skippedLogin` is cleared so `showShell` is false and the login screen
   * shows (NOT local mode) — the user explicitly signed out, so they must
   * choose again: sign back in or "Continue without account" (`skipLogin`).
   */
  async function logout(): Promise<void> {
    // If already on local, nothing to switch (e.g. session-expired reset).
    if (readCurrentContext() !== LOCAL_CONTEXT) {
      try {
        await switchContext(LOCAL_CONTEXT);
      } catch (e) {
        // eslint-disable-next-line no-console
        logger.error("[auth] logout switch to local failed:", e);
      }
    }
    writeCurrentContext(LOCAL_CONTEXT);
    skippedLogin.value = false;
    writeSkipped(false);
    user.value = undefined;
    status.value = "logged-out";
    pendingMfa.value = null;
    error.value = "";
    contextChangeSignal.value += 1;
  }

  /** Local-only mode: switch to the local context, skip the login screen, keep
   * using the app offline with the local DB's data. */
  function skipLogin(): void {
    writeCurrentContext(LOCAL_CONTEXT);
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
    resendStatus,
    skippedLogin,
    contextChangeSignal,
    isLoggedIn,
    showShell,
    init,
    login,
    submitMfa,
    resendMfaCode,
    switchMfaMethod,
    signup,
    logout,
    skipLogin,
    requestSignIn
  };
});