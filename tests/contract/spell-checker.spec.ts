// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  languageName,
  toLanguage,
  resolveLanguage,
  resolveEnabledCodes,
  sortLanguages,
  SPELLCHECKER_ENABLED_DEFAULT,
  type Language
} from "@contracts/spell-checker";
import { useSpellCheckerStore } from "@/stores/spell-checker";
import { getCommand, type CommandContext } from "@/commands/registry";
// Importing app-commands registers the app commands (incl. app:toggle-spell-check).
import "@/commands/app-commands";

// ---------------------------------------------------------------------------
// Pure helpers (contracts/spell-checker.ts)
// ---------------------------------------------------------------------------

describe("languageName / toLanguage (pure)", () => {
  it("returns the table name for a known code", () => {
    expect(languageName("en-US")).toBe("English (US)");
    expect(languageName("de-DE")).toBe("German (Germany)");
    expect(languageName("pt-BR")).toBe("Portuguese (Brazil)");
  });

  it("falls back to the bare code when unknown", () => {
    expect(languageName("xx-YY")).toBe("xx-YY");
  });

  it("toLanguage pairs code + name", () => {
    expect(toLanguage("en-GB")).toEqual({ code: "en-GB", name: "English (UK)" });
    expect(toLanguage("zz")).toEqual({ code: "zz", name: "zz" });
  });
});

describe("resolveLanguage (pure)", () => {
  const available = ["en-US", "en-GB", "es-MX", "es-AR", "de", "fr"];

  it("returns the code when directly available", () => {
    expect(resolveLanguage("en-US", available)).toBe("en-US");
    expect(resolveLanguage("de", available)).toBe("de");
  });

  it("falls back to the bare language tag when the full code is unavailable", () => {
    // "de-DE" is not in the available set, but "de" is.
    expect(resolveLanguage("de-DE", available)).toBe("de");
  });

  it("applies the redirect map (es -> es-MX) when the target is available", () => {
    expect(resolveLanguage("es", available)).toBe("es-MX");
    expect(resolveLanguage("es-419", available)).toBe("es-MX");
    expect(resolveLanguage("es-ES", available)).toBe("es-AR");
  });

  it("returns the requested code (not undefined) for a redirect target that is unavailable", () => {
    expect(resolveLanguage("es", ["en-US"])).toBe("es");
  });

  it("returns undefined when neither the code nor its bare tag is available", () => {
    expect(resolveLanguage("xx-YY", available)).toBeUndefined();
    expect(resolveLanguage("xx", available)).toBeUndefined();
  });
});

describe("resolveEnabledCodes (pure)", () => {
  const available = ["en-US", "en-GB", "es-MX", "de"];

  it("resolves each code and drops unresolvable ones", () => {
    expect(resolveEnabledCodes(["en-US", "es", "de-DE", "xx"], available)).toEqual([
      "en-US",
      "es-MX",
      "de"
    ]);
  });

  it("returns an empty array for no resolvable codes", () => {
    expect(resolveEnabledCodes(["xx", "yy"], available)).toEqual([]);
  });
});

describe("sortLanguages (pure)", () => {
  it("sorts by display name, locale-aware, without mutating the input", () => {
    const input: Language[] = [
      toLanguage("de"),
      toLanguage("en-US"),
      toLanguage("es-MX")
    ];
    const sorted = sortLanguages(input);
    // By display name: English (US) < German < Spanish (Mexico).
    expect(sorted.map((l) => l.code)).toEqual(["en-US", "de", "es-MX"]);
    // Input order unchanged.
    expect(input.map((l) => l.code)).toEqual(["de", "en-US", "es-MX"]);
  });
});

describe("SPELLCHECKER_ENABLED_DEFAULT", () => {
  it("defaults to true (mirrors upstream)", () => {
    expect(SPELLCHECKER_ENABLED_DEFAULT).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Store (fake desktop.spellChecker bridge)
// ---------------------------------------------------------------------------

const { bridge } = vi.hoisted(() => ({
  bridge: {
    isEnabled: { query: vi.fn() },
    languages: { query: vi.fn() },
    enabledLanguages: { query: vi.fn() },
    setLanguages: { mutate: vi.fn() },
    toggle: { mutate: vi.fn() },
    words: { query: vi.fn() },
    deleteWord: { mutate: vi.fn() }
  }
}));

vi.mock("@/platform/desktop-bridge", () => ({
  desktop: { spellChecker: bridge }
}));

function resetBridge(): void {
  bridge.isEnabled.query.mockReset();
  bridge.languages.query.mockReset();
  bridge.enabledLanguages.query.mockReset();
  bridge.setLanguages.mutate.mockReset();
  bridge.toggle.mutate.mockReset();
  bridge.words.query.mockReset();
  bridge.deleteWord.mutate.mockReset();
  // Sensible defaults so a test that doesn't care about a value still gets a
  // stable snapshot.
  bridge.isEnabled.query.mockResolvedValue(true);
  bridge.languages.query.mockResolvedValue([toLanguage("en-US"), toLanguage("de")]);
  bridge.enabledLanguages.query.mockResolvedValue([toLanguage("en-US")]);
  bridge.words.query.mockResolvedValue(["teh", "recieve"]);
  bridge.setLanguages.mutate.mockResolvedValue(undefined);
  bridge.toggle.mutate.mockResolvedValue(true);
  bridge.deleteWord.mutate.mockResolvedValue(undefined);
}

describe("useSpellCheckerStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetBridge();
  });

  it("starts idle (disabled, empty lists, no error)", () => {
    const s = useSpellCheckerStore();
    expect(s.busy).toBe(false);
    expect(s.enabled).toBe(false);
    expect(s.availableLanguages).toEqual([]);
    expect(s.enabledLanguages).toEqual([]);
    expect(s.dictionaryWords).toEqual([]);
    expect(s.enabledCodes).toEqual([]);
    expect(s.lastError).toBeNull();
  });

  it("refresh loads enabled + available + enabled languages + words in parallel", async () => {
    bridge.isEnabled.query.mockResolvedValue(true);
    bridge.languages.query.mockResolvedValue([toLanguage("en-US"), toLanguage("de")]);
    bridge.enabledLanguages.query.mockResolvedValue([toLanguage("en-US"), toLanguage("de")]);
    bridge.words.query.mockResolvedValue(["teh"]);
    const s = useSpellCheckerStore();
    const ok = await s.refresh();
    expect(ok).toBe(true);
    expect(s.busy).toBe(false);
    expect(s.enabled).toBe(true);
    expect(s.availableLanguages).toHaveLength(2);
    expect(s.enabledCodes).toEqual(["en-US", "de"]);
    expect(s.dictionaryWords).toEqual(["teh"]);
    expect(s.lastError).toBeNull();
    // All four queries were issued (parallel — order not asserted).
    expect(bridge.isEnabled.query).toHaveBeenCalledTimes(1);
    expect(bridge.languages.query).toHaveBeenCalledTimes(1);
    expect(bridge.enabledLanguages.query).toHaveBeenCalledTimes(1);
    expect(bridge.words.query).toHaveBeenCalledTimes(1);
  });

  it("refresh never throws on bridge error (sets lastError, returns false)", async () => {
    bridge.isEnabled.query.mockRejectedValue(new Error("bridge down"));
    const s = useSpellCheckerStore();
    const ok = await s.refresh();
    expect(ok).toBe(false);
    expect(s.busy).toBe(false);
    expect(s.lastError).toBe("bridge down");
    // State left intact on failure.
    expect(s.enabled).toBe(false);
  });

  it("toggleSpellCheck applies the returned enabled state", async () => {
    bridge.toggle.mutate.mockResolvedValue(false);
    const s = useSpellCheckerStore();
    const ok = await s.toggleSpellCheck(false);
    expect(ok).toBe(true);
    expect(bridge.toggle.mutate).toHaveBeenCalledWith({ enabled: false });
    expect(s.enabled).toBe(false);
    expect(s.lastError).toBeNull();
  });

  it("toggleSpellCheck never throws on bridge error", async () => {
    bridge.toggle.mutate.mockRejectedValue(new Error("denied"));
    const s = useSpellCheckerStore();
    const ok = await s.toggleSpellCheck(true);
    expect(ok).toBe(false);
    expect(s.lastError).toBe("denied");
    // Enabled left intact on failure.
    expect(s.enabled).toBe(false);
  });

  it("setLanguages calls the bridge and re-reads enabledLanguages", async () => {
    bridge.enabledLanguages.query.mockResolvedValue([toLanguage("en-US"), toLanguage("de")]);
    const s = useSpellCheckerStore();
    const ok = await s.setLanguages(["en-US", "de"]);
    expect(ok).toBe(true);
    expect(bridge.setLanguages.mutate).toHaveBeenCalledWith(["en-US", "de"]);
    expect(bridge.enabledLanguages.query).toHaveBeenCalledTimes(1);
    expect(s.enabledCodes).toEqual(["en-US", "de"]);
  });

  it("setLanguages never throws on bridge error", async () => {
    bridge.setLanguages.mutate.mockRejectedValue(new Error("nope"));
    const s = useSpellCheckerStore();
    const ok = await s.setLanguages(["en-US"]);
    expect(ok).toBe(false);
    expect(s.lastError).toBe("nope");
  });

  it("deleteWord removes the word locally + calls the bridge", async () => {
    const s = useSpellCheckerStore();
    s.dictionaryWords = ["teh", "recieve"];
    const ok = await s.deleteWord("teh");
    expect(ok).toBe(true);
    expect(bridge.deleteWord.mutate).toHaveBeenCalledWith("teh");
    expect(s.dictionaryWords).toEqual(["recieve"]);
  });

  it("deleteWord never throws on bridge error", async () => {
    bridge.deleteWord.mutate.mockRejectedValue(new Error("readonly"));
    const s = useSpellCheckerStore();
    s.dictionaryWords = ["teh"];
    const ok = await s.deleteWord("teh");
    expect(ok).toBe(false);
    expect(s.lastError).toBe("readonly");
    // Local list left intact on failure.
    expect(s.dictionaryWords).toEqual(["teh"]);
  });

  it("enabledCodes tracks enabledLanguages reactively", async () => {
    bridge.enabledLanguages.query.mockResolvedValue([toLanguage("en-US")]);
    const s = useSpellCheckerStore();
    await s.refresh();
    expect(s.enabledCodes).toEqual(["en-US"]);
    bridge.enabledLanguages.query.mockResolvedValue([toLanguage("en-US"), toLanguage("de")]);
    await s.refresh();
    expect(s.enabledCodes).toEqual(["en-US", "de"]);
  });
});

// ---------------------------------------------------------------------------
// Palette command
// ---------------------------------------------------------------------------

function stubCtx(showShell: boolean, spellChecker: ReturnType<typeof useSpellCheckerStore>): CommandContext {
  return {
    editor: undefined,
    notes: undefined as unknown as CommandContext["notes"],
    auth: { showShell } as unknown as CommandContext["auth"],
    shell: undefined as unknown as CommandContext["shell"],
    sync: undefined as unknown as CommandContext["sync"],
    updater: undefined as unknown as CommandContext["updater"],
    spellChecker,
    router: undefined as CommandContext["router"],
    closePalette: () => {}
  };
}

describe("app toggle-spell-check command (Phase 6.6)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetBridge();
  });

  it("registers app:toggle-spell-check", () => {
    expect(getCommand("app:toggle-spell-check")).toBeDefined();
  });

  it("is visible when the shell is showing", () => {
    const s = useSpellCheckerStore();
    const cmd = getCommand("app:toggle-spell-check")!;
    expect(cmd.when?.(stubCtx(true, s))).toBe(true);
    expect(cmd.when?.(stubCtx(false, s))).toBe(false);
  });

  it("run toggles to the opposite of the current enabled state", () => {
    bridge.toggle.mutate.mockResolvedValue(true);
    const s = useSpellCheckerStore();
    s.enabled = false;
    const cmd = getCommand("app:toggle-spell-check")!;
    cmd.run(stubCtx(true, s));
    return vi.waitFor(() => {
      expect(bridge.toggle.mutate).toHaveBeenCalledWith({ enabled: true });
    });
  });

  it("run toggles off when currently enabled", () => {
    bridge.toggle.mutate.mockResolvedValue(false);
    const s = useSpellCheckerStore();
    s.enabled = true;
    const cmd = getCommand("app:toggle-spell-check")!;
    cmd.run(stubCtx(true, s));
    return vi.waitFor(() => {
      expect(bridge.toggle.mutate).toHaveBeenCalledWith({ enabled: false });
    });
  });
});