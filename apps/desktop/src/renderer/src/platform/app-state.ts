/**
 * Renderer handle to the main-process app-state store (`userData/app-state.json`)
 * — origin-independent persistence for small renderer flags that must survive
 * a renderer `localStorage` reset. See `src/main/app-state.ts` for why this
 * exists (the local-mode `skippedLogin` login gate was lost on hard-quit /
 * dev-origin drift when it lived only in renderer localStorage).
 *
 * Thin + fault-tolerant: every call swallows IPC failures (returns `{}` /
 * no-ops) so a bridge hiccup never breaks the boot path that reads this. The
 * auth store treats `skippedLogin` from here as AUTHORITATIVE when present
 * (see `stores/auth.ts` `init()`), falling back to the localStorage value
 * read at store construction when no value is persisted (fresh install /
 * pre-migration from the localStorage-only era).
 */
import { desktop } from "./desktop-bridge";
import type { AppState } from "@contracts/router";

/** Read the persisted app state. Returns `{}` on any failure (never throws). */
export async function getAppState(): Promise<AppState> {
  try {
    return await desktop.appState.get.query();
  } catch {
    return {};
  }
}

/** Merge `patch` into the persisted app state (read-modify-write in main).
 *  Fire-and-forget from callers; never throws. */
export async function setAppState(patch: Partial<AppState>): Promise<void> {
  try {
    await desktop.appState.set.mutate(patch);
  } catch {
    /* best-effort — localStorage is still updated by the caller */
  }
}