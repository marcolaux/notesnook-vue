/**
 * Diagnostic logging gate — a single localStorage-backed toggle that controls
 * every `console.log`/`warn`/`info`/`debug` call routed through `logger` in the
 * renderer (stores + utils). Genuine errors (`logger.error`) ALWAYS print, so
 * real failures still surface in packaged builds even with logging off.
 *
 * Default policy:
 *  - **Dev** (`import.meta.env.DEV`): forced ON. The check is a compile-time
 *    constant in the Vite bundle, so in a packaged build the dev branch is dead
 *    code and incurs zero cost.
 *  - **Shipped/packaged**: OFF by default; the user can enable it in Settings →
 *    Updates → Logging.
 *
 * `readLoggingEnabled` reads `localStorage` directly (no settings-store import)
 * so this module is a dependency-free leaf — safe to import from Web Workers
 * (which have no `localStorage`; the `try/catch` returns the default) and from
 * the settings store itself without creating an import cycle. Reading fresh on
 * every call means the Settings toggle takes effect live without a reload.
 *
 * The `[tag] ...` prefix convention used across the codebase (`[sync]`, `[vault]`,
 * `[vector-search]`, …) is preserved — callers still pass the tag string; the
 * gate only decides whether it reaches the console.
 */
export const LOGGING_ENABLED_KEY = "notesnook.loggingEnabled";
const DEFAULT_LOGGING_ENABLED = false;

/**
 * Whether diagnostic logging is currently enabled. Forced on in dev; otherwise
 * reads the persisted toggle (default off). Worker-safe: a `localStorage`
 * access that throws (no `window`/`localStorage` in a Web Worker) falls back to
 * the default instead of propagating.
 */
export function readLoggingEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    const v = localStorage.getItem(LOGGING_ENABLED_KEY);
    if (v === "true") return true;
    if (v === "false") return false;
  } catch {
    /* no localStorage available (e.g. Web Worker) — fall through to default */
  }
  return DEFAULT_LOGGING_ENABLED;
}

/** Persist the logging toggle (renderer only — no-op where `localStorage` is absent). */
export function writeLoggingEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(LOGGING_ENABLED_KEY, enabled ? "true" : "false");
  } catch {
    /* best-effort — persistence is optional */
  }
}

function gated(fn: (...args: unknown[]) => void): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    if (readLoggingEnabled()) fn(...args);
  };
}

export const logger = {
  /** Debug/informative log — gated by the Logging setting (forced on in dev). */
  log: gated((...args: unknown[]) => console.log(...args)),
  /** Informational log — gated by the Logging setting (forced on in dev). */
  info: gated((...args: unknown[]) => console.info(...args)),
  /** Warning — gated by the Logging setting (forced on in dev). */
  warn: gated((...args: unknown[]) => console.warn(...args)),
  /** Verbose debug — gated by the Logging setting (forced on in dev). */
  debug: gated((...args: unknown[]) => console.log(...args)),
  /**
   * Genuine error — ALWAYS prints, regardless of the Logging setting, so real
   * failures are never silently swallowed in a packaged build.
   */
  error(...args: unknown[]): void {
    console.error(...args);
  }
};