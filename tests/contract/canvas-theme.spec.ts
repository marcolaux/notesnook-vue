// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  readCanvasThemeColors,
  parseRGB,
  withAlpha,
  onThemeChange,
  type CanvasThemeColors
} from "@/utils/canvas-theme";

describe("parseRGB (pure)", () => {
  it("parses #rrggbb", () => {
    expect(parseRGB("#008837")).toEqual({ r: 0, g: 136, b: 55 });
  });

  it("parses #rgb (short form)", () => {
    expect(parseRGB("#0a3")).toEqual({ r: 0, g: 170, b: 51 });
  });

  it("parses rgb(...) and rgba(...)", () => {
    expect(parseRGB("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseRGB("rgba(10, 20, 30, 0.5)")).toEqual({ r: 10, g: 20, b: 30 });
  });

  it("returns null for unparseable input", () => {
    expect(parseRGB("var(--accent)")).toBeNull();
    expect(parseRGB("not a color")).toBeNull();
    expect(parseRGB("#12345")).toBeNull();
  });
});

describe("withAlpha (pure)", () => {
  it("converts a hex to rgba with the given alpha", () => {
    expect(withAlpha("#008837", 0.35)).toBe("rgba(0, 136, 55, 0.35)");
  });

  it("passes through unparseable colors unchanged (no guard needed at call site)", () => {
    expect(withAlpha("var(--accent)", 0.3)).toBe("var(--accent)");
  });
});

describe("readCanvasThemeColors", () => {
  beforeEach(() => {
    // Reset any previously injected tokens.
    const el = document.documentElement;
    el.style.cssText = "";
  });

  it("returns dark-theme fallbacks when no tokens are set", () => {
    const colors = readCanvasThemeColors();
    expect(colors.backdrop).toBe("#181818");
    expect(colors.accent).toBe("#008837");
  });

  it("reads tokens injected onto <html> (mirrors injectTheme)", () => {
    const el = document.documentElement;
    el.style.setProperty("--background", "#ffffff");
    el.style.setProperty("--paragraph", "#505050");
    el.style.setProperty("--paragraph-secondary", "#818589");
    el.style.setProperty("--border", "#E8E8E8");
    el.style.setProperty("--accent", "#008837");

    const colors: CanvasThemeColors = readCanvasThemeColors();
    expect(colors.backdrop).toBe("#ffffff");
    expect(colors.text).toBe("#505050");
    expect(colors.textMuted).toBe("#818589");
    expect(colors.border).toBe("#E8E8E8");
    expect(colors.accent).toBe("#008837");
  });
});

describe("onThemeChange", () => {
  it("fires the callback when <html data-theme> flips", async () => {
    let calls = 0;
    const teardown = onThemeChange(() => {
      calls++;
    });
    try {
      document.documentElement.setAttribute("data-theme", "default-light");
      await new Promise((r) => setTimeout(r, 0));
      document.documentElement.setAttribute("data-theme", "default-dark");
      await new Promise((r) => setTimeout(r, 0));
      expect(calls).toBe(2);
    } finally {
      teardown();
    }
  });

  it("teardown disconnects the observer", async () => {
    let calls = 0;
    const teardown = onThemeChange(() => {
      calls++;
    });
    teardown();
    document.documentElement.setAttribute("data-theme", "default-light");
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(0);
  });
});