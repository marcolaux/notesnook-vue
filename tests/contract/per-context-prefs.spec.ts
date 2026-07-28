/**
 * Contract tests for the per-context client-preference namespace helper
 * (`per-context-prefs.ts`). This layer keys client-only settings by `ContextId`
 * so each account keeps its own value; the cross-window `storage` listener and
 * the stores' read/write paths depend on it being unambiguous and on legacy
 * fallback being idempotent. A regression here would either leak a preference
 * across accounts or lose an upgrading user's existing value.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ctxKey,
  readCtxString,
  writeCtxString,
  removeCtxKey,
  readCtxStringWithLegacy,
  migrateLegacyToCtx,
  matchCtxKey,
  LOCAL_CONTEXT
} from "@/platform/per-context-prefs";

class MemLocalStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

let savedLocalStorage: unknown;

beforeEach(() => {
  savedLocalStorage = (globalThis as unknown as { localStorage?: unknown }).localStorage;
  (globalThis as unknown as { localStorage: MemLocalStorage }).localStorage = new MemLocalStorage();
});

afterEach(() => {
  (globalThis as unknown as { localStorage?: unknown }).localStorage = savedLocalStorage;
});

const BASE = "notesnook.themeMode";
const HEX = "a1b2c3d4e5f60718";

describe("per-context-prefs", () => {
  describe("ctxKey", () => {
    it("appends the ctx with a dot", () => {
      expect(ctxKey(BASE, LOCAL_CONTEXT)).toBe("notesnook.themeMode.local");
      expect(ctxKey(BASE, HEX)).toBe(`notesnook.themeMode.${HEX}`);
    });
  });

  describe("read / write / remove", () => {
    it("writes and reads the ctx-suffixed key only (never touches legacy)", () => {
      writeCtxString(BASE, HEX, "dark");
      expect(localStorage.getItem(ctxKey(BASE, HEX))).toBe("dark");
      expect(localStorage.getItem(BASE)).toBeNull();
      expect(readCtxString(BASE, HEX)).toBe("dark");
    });

    it("returns null when the ctx key is absent", () => {
      expect(readCtxString(BASE, HEX)).toBeNull();
    });

    it("isolates contexts — writing one ctx does not read as another", () => {
      writeCtxString(BASE, LOCAL_CONTEXT, "light");
      writeCtxString(BASE, HEX, "dark");
      expect(readCtxString(BASE, LOCAL_CONTEXT)).toBe("light");
      expect(readCtxString(BASE, HEX)).toBe("dark");
    });

    it("removeCtxKey drops only the ctx key", () => {
      writeCtxString(BASE, HEX, "dark");
      localStorage.setItem(BASE, "light"); // legacy
      removeCtxKey(BASE, HEX);
      expect(readCtxString(BASE, HEX)).toBeNull();
      expect(localStorage.getItem(BASE)).toBe("light");
    });
  });

  describe("readCtxStringWithLegacy", () => {
    it("prefers the ctx key over the legacy key", () => {
      localStorage.setItem(BASE, "light");
      writeCtxString(BASE, HEX, "dark");
      const r = readCtxStringWithLegacy(BASE, HEX);
      expect(r.value).toBe("dark");
      expect(r.fromLegacy).toBe(false);
    });

    it("falls back to the legacy key when the ctx key is absent", () => {
      localStorage.setItem(BASE, "light");
      const r = readCtxStringWithLegacy(BASE, HEX);
      expect(r.value).toBe("light");
      expect(r.fromLegacy).toBe(true);
    });

    it("returns null + fromLegacy false when neither key is present", () => {
      const r = readCtxStringWithLegacy(BASE, HEX);
      expect(r.value).toBeNull();
      expect(r.fromLegacy).toBe(false);
    });
  });

  describe("migrateLegacyToCtx", () => {
    it("copies the legacy value into the ctx key", () => {
      localStorage.setItem(BASE, "light");
      expect(migrateLegacyToCtx(BASE, HEX)).toBe(true);
      expect(readCtxString(BASE, HEX)).toBe("light");
      // legacy key is left in place
      expect(localStorage.getItem(BASE)).toBe("light");
    });

    it("is idempotent — a no-op once the ctx key exists", () => {
      localStorage.setItem(BASE, "light");
      migrateLegacyToCtx(BASE, HEX);
      expect(migrateLegacyToCtx(BASE, HEX)).toBe(false);
    });

    it("is a no-op when the legacy key is absent", () => {
      expect(migrateLegacyToCtx(BASE, HEX)).toBe(false);
      expect(readCtxString(BASE, HEX)).toBeNull();
    });

    it("migrates per-ctx — each ctx independently inherits the legacy value", () => {
      localStorage.setItem(BASE, "light");
      expect(migrateLegacyToCtx(BASE, LOCAL_CONTEXT)).toBe(true);
      expect(migrateLegacyToCtx(BASE, HEX)).toBe(true);
      expect(readCtxString(BASE, LOCAL_CONTEXT)).toBe("light");
      expect(readCtxString(BASE, HEX)).toBe("light");
    });
  });

  describe("matchCtxKey", () => {
    it("matches a ctx-suffixed key and returns the suffix", () => {
      expect(matchCtxKey(ctxKey(BASE, HEX), [BASE])).toEqual({ base: BASE, ctx: HEX });
    });

    it("matches the local ctx suffix", () => {
      expect(matchCtxKey(ctxKey(BASE, LOCAL_CONTEXT), [BASE])).toEqual({
        base: BASE,
        ctx: LOCAL_CONTEXT
      });
    });

    it("matches a legacy un-suffixed key with ctx null", () => {
      expect(matchCtxKey(BASE, [BASE])).toEqual({ base: BASE, ctx: null });
    });

    it("matches the first of several bases (bases with dots are atomic)", () => {
      const darkBase = "notesnook.theme.dark";
      expect(matchCtxKey(`${darkBase}.${HEX}`, [BASE, darkBase])).toEqual({
        base: darkBase,
        ctx: HEX
      });
    });

    it("does not false-match a base that is a prefix of another base", () => {
      // `notesnook.theme` is a prefix of `notesnook.theme.dark`; a key for the
      // latter must not match the former.
      const short = "notesnook.theme";
      const long = "notesnook.theme.dark";
      expect(matchCtxKey(`${long}.${HEX}`, [short])).toBeNull();
    });

    it("returns null when no base matches", () => {
      expect(matchCtxKey("notesnook.unrelated.local", [BASE])).toBeNull();
    });
  });
});