import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { desktop } from "@/platform/desktop-bridge";
import type { Language } from "@contracts/spell-checker";
import { logger } from "@/utils/logger";

/**
 * Spell-checker store (Phase 6.6 — headless control slice) — the reactive
 * surface for the main-process Electron `session` spell-checker, reached over
 * the tRPC bridge as `desktop.spellChecker.*`.
 *
 * Design (mirrors `stores/updater.ts` / `stores/sync.ts`):
 *  - **Never throws.** Every action catches, sets `lastError`, logs, and
 *    returns `boolean` success (state left intact on failure).
 *  - **Request/response, no events.** Electron's session spell-checker emits
 *    no lifecycle events we need to mirror, so — unlike the vault/status stores
 *    — there is nothing to subscribe to. Callers poll `refresh()` (the on-site
 *    UI does so on boot + when the panel opens).
 *
 * The store keeps the global `enabled` flag, the available + enabled language
 * lists, and the custom-dictionary words. The pure language table + resolution
 * helpers live in `@contracts/spell-checker` (shared with the main impl), so
 * this store only round-trips values over the bridge.
 *
 * The per-note `spellcheck` toggle (`db.notes.spellcheck`) is a separate
 * Properties-panel concern (Phase 5.1 follow-up, on-site) — this store is the
 * *global* engine enable/languages surface.
 */
export const useSpellCheckerStore = defineStore("spellChecker", () => {
  /** A `refresh` / `toggle` / `setLanguages` / `deleteWord` call is in flight. */
  const busy = ref(false);
  /** Global spell-checker enabled flag (persisted main-side). */
  const enabled = ref(false);
  /** Languages the platform supports (display-name-sorted by the main impl). */
  const availableLanguages = ref<Language[]>([]);
  /** Languages currently enabled for spell-checking. */
  const enabledLanguages = ref<Language[]>([]);
  /** Words in the user's custom spell-checker dictionary. */
  const dictionaryWords = ref<string[]>([]);
  const lastError = ref<string | null>(null);

  /** Codes of the currently enabled languages (for chip/picker UI). */
  const enabledCodes = computed(() => enabledLanguages.value.map((l) => l.code));

  function clearError(): void {
    lastError.value = null;
  }

  /** Load the full snapshot (enabled + available + enabled languages + words).
   *  Never throws. */
  async function refresh(): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const [isEnabled, available, enabledLangs, words] = await Promise.all([
        desktop.spellChecker.isEnabled.query(),
        desktop.spellChecker.languages.query(),
        desktop.spellChecker.enabledLanguages.query(),
        desktop.spellChecker.words.query()
      ]);
      enabled.value = isEnabled;
      availableLanguages.value = available;
      enabledLanguages.value = enabledLangs;
      dictionaryWords.value = words;
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      logger.error("[spell-checker] refresh failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** Enable or disable the global spell-checker. Returns `true` on success.
   *  Never throws. */
  async function toggleSpellCheck(value: boolean): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const next = await desktop.spellChecker.toggle.mutate({ enabled: value });
      enabled.value = next;
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      logger.error("[spell-checker] toggle failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** Set the enabled languages (codes are resolved against the available set
   *  by the main impl). Returns `true` on success. Never throws. */
  async function setLanguages(codes: string[]): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      await desktop.spellChecker.setLanguages.mutate(codes);
      // Re-read the enabled list so the store reflects the resolved codes.
      try {
        enabledLanguages.value = await desktop.spellChecker.enabledLanguages.query();
      } catch {
        /* best-effort refresh */
      }
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      logger.error("[spell-checker] setLanguages failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** Remove a word from the custom dictionary. Returns `true` on success.
   *  Never throws. */
  async function deleteWord(word: string): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      await desktop.spellChecker.deleteWord.mutate(word);
      // Drop the word locally so the UI updates without a full refresh.
      dictionaryWords.value = dictionaryWords.value.filter((w) => w !== word);
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      logger.error("[spell-checker] deleteWord failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  return {
    busy,
    enabled,
    availableLanguages,
    enabledLanguages,
    dictionaryWords,
    lastError,
    enabledCodes,
    refresh,
    toggleSpellCheck,
    setLanguages,
    deleteWord
  };
});