/**
 * Main-process spell-checker (Phase 6.6) — wraps Electron's `session`
 * spell-check API behind the {@link SpellCheckerServer} contract and registers
 * it with the tRPC bridge.
 *
 * Electron's spell-checker is session-scoped: `webContents.session` exposes
 * `availableSpellCheckerLanguages`, `getSpellCheckerLanguages` /
 * `setSpellCheckerLanguages`, `setSpellCheckerEnabled`, and the custom
 * dictionary (`listWordsInSpellCheckerDictionary` /
 * `removeWordFromSpellCheckerDictionary`). This impl binds to the main
 * window's session (falling back to `session.defaultSession` when no window is
 * bound yet) and persists the global enabled flag to `spellchecker.json` in
 * `userData` so it survives restarts (mirrors upstream `config.isSpellCheckerEnabled`
 * + `JSONStorage`).
 *
 * The pure language table + resolution helpers (`resolveLanguage`,
 * `resolveEnabledCodes`, `toLanguage`, `sortLanguages`) are imported from
 * `../contracts/spell-checker` so the renderer + tests share the exact same
 * logic. This file is main-only (Electron + node:fs) and therefore not
 * contract-tested; the renderer store is tested against a mocked bridge.
 */
import { app, session as electronSession, type BrowserWindow } from "electron";
import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import {
  SPELLCHECKER_ENABLED_DEFAULT,
  resolveEnabledCodes,
  sortLanguages,
  toLanguage,
  type Language
} from "../contracts/spell-checker";
import {
  registerSpellCheckerServer,
  type SpellCheckerServer
} from "../contracts/router";

function configFile(): string {
  return path.join(app.getPath("userData"), "spellchecker.json");
}

function readEnabled(): boolean {
  try {
    const data = JSON.parse(readFileSync(configFile(), "utf-8")) as { enabled?: boolean };
    return typeof data.enabled === "boolean" ? data.enabled : SPELLCHECKER_ENABLED_DEFAULT;
  } catch {
    return SPELLCHECKER_ENABLED_DEFAULT;
  }
}

function writeEnabled(enabled: boolean): void {
  try {
    writeFileSync(configFile(), JSON.stringify({ enabled }));
  } catch {
    // Persistence is best-effort; the in-memory + session state still apply.
  }
}

/** Bound once at registration; the window's session backs every procedure. */
let targetWindow: BrowserWindow | undefined;

/** The session to operate on — the bound window's, or the default session. */
function sess(): Electron.Session {
  const w = targetWindow;
  if (w && !w.isDestroyed()) return w.webContents.session;
  return electronSession.defaultSession;
}

export const spellCheckerServer: SpellCheckerServer = {
  async isEnabled(): Promise<boolean> {
    // Prefer the persisted flag (source of truth across restarts); the session
    // property mirrors it after `registerSpellChecker` applies it.
    return readEnabled();
  },

  async languages(): Promise<Language[]> {
    const available = sess().availableSpellCheckerLanguages ?? [];
    return sortLanguages(available.map(toLanguage));
  },

  async enabledLanguages(): Promise<Language[]> {
    const s = sess();
    const available = s.availableSpellCheckerLanguages ?? [];
    const enabled = s.getSpellCheckerLanguages() ?? [];
    const resolved = resolveEnabledCodes(enabled, available);
    return resolved.map(toLanguage);
  },

  async setLanguages(codes: string[]): Promise<void> {
    const s = sess();
    const available = s.availableSpellCheckerLanguages ?? [];
    const resolved = resolveEnabledCodes(codes, available);
    s.setSpellCheckerLanguages(resolved);
  },

  async toggle(enabled: boolean): Promise<boolean> {
    const s = sess();
    s.setSpellCheckerEnabled(enabled);
    writeEnabled(enabled);
    return enabled;
  },

  async words(): Promise<string[]> {
    return sess().listWordsInSpellCheckerDictionary() ?? [];
  },

  async deleteWord(word: string): Promise<void> {
    sess().removeWordFromSpellCheckerDictionary(word);
  }
};

/**
 * Register the spell-checker server + apply the persisted enabled flag to the
 * bound window's session. Called from `main/index.ts` after the main window is
 * created (the window's session is the spell-check surface).
 */
export function registerSpellChecker(window?: BrowserWindow): void {
  targetWindow = window;
  // Apply the persisted enabled flag so a restart honours the user's choice.
  // `setSpellCheckerEnabled` is the documented setter; safe to call pre-ready
  // here because this runs inside `app.whenReady()`.
  try {
    electronSession.defaultSession.setSpellCheckerEnabled(readEnabled());
  } catch {
    // Ignore — the session may not accept the call in some environments.
  }
  registerSpellCheckerServer(spellCheckerServer);
}