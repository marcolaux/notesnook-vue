// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  detectPlatform,
  titlebarPadding,
  TRAFFIC_LIGHT_INSET,
  WINDOW_CONTROLS_FALLBACK_WIDTH,
  type Platform
} from "@contracts/titlebar";
import { useTitleBarStore } from "@/stores/titlebar";

describe("detectPlatform", () => {
  it("maps process.platform values", () => {
    expect(detectPlatform("darwin")).toBe<Platform>("macos");
    expect(detectPlatform("win32")).toBe<Platform>("windows");
    expect(detectPlatform("linux")).toBe<Platform>("linux");
  });

  it("falls back to 'other' for unknown / missing values", () => {
    expect(detectPlatform("aix")).toBe<Platform>("other");
    expect(detectPlatform(undefined)).toBe<Platform>("other");
    expect(detectPlatform(null)).toBe<Platform>("other");
    expect(detectPlatform("")).toBe<Platform>("other");
  });
});

describe("titlebarPadding", () => {
  it("macOS reserves the traffic-light inset on the left", () => {
    const p = titlebarPadding("macos");
    expect(p.left).toBe(TRAFFIC_LIGHT_INSET);
    expect(p.right).toBe(12);
  });

  it("Windows/Linux reserve the WCO width on the right", () => {
    const win = titlebarPadding("windows");
    expect(win.left).toBe(12);
    expect(win.right).toBe(WINDOW_CONTROLS_FALLBACK_WIDTH);

    const linux = titlebarPadding("linux");
    expect(linux.left).toBe(12);
    expect(linux.right).toBe(WINDOW_CONTROLS_FALLBACK_WIDTH);
  });

  it("uses the measured WCO width when provided (>0)", () => {
    const p = titlebarPadding("windows", 152);
    expect(p.right).toBe(152);
  });

  it("ignores a non-positive measured width (falls back)", () => {
    expect(titlebarPadding("windows", 0).right).toBe(WINDOW_CONTROLS_FALLBACK_WIDTH);
    expect(titlebarPadding("linux", -5).right).toBe(WINDOW_CONTROLS_FALLBACK_WIDTH);
  });

  it("macOS ignores the WCO width (no right-side controls)", () => {
    const p = titlebarPadding("macos", 200);
    expect(p.right).toBe(12);
    expect(p.left).toBe(TRAFFIC_LIGHT_INSET);
  });

  it("'other' (web fallback) is symmetric base padding", () => {
    const p = titlebarPadding("other");
    expect(p).toEqual({ left: 12, right: 12 });
  });

  it("is non-mutating / referentially stable per input", () => {
    const a = titlebarPadding("macos");
    const b = titlebarPadding("macos");
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe("useTitleBarStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("detects platform from window.os when present", () => {
    (globalThis as { window?: { os: string } }).window = { os: "darwin" };
    const t = useTitleBarStore();
    expect(t.platform).toBe<Platform>("macos");
    expect(t.isMacos).toBe(true);
    expect(t.isDesktop).toBe(true);
    delete (globalThis as { window?: { os: string } }).window;
  });

  it("defaults to 'other' when window/os is absent (node test env)", () => {
    const t = useTitleBarStore();
    expect(t.platform).toBe<Platform>("other");
    expect(t.isDesktop).toBe(false);
  });

  it("padding recomputes when platform changes via setPlatform", () => {
    const t = useTitleBarStore();
    expect(t.padding.left).toBe(12);

    t.setPlatform("macos");
    expect(t.padding.left).toBe(TRAFFIC_LIGHT_INSET);
    expect(t.padding.right).toBe(12);

    t.setPlatform("windows");
    expect(t.padding.left).toBe(12);
    expect(t.padding.right).toBe(WINDOW_CONTROLS_FALLBACK_WIDTH);
  });

  it("setControlsWidth drives the right inset on Windows/Linux", () => {
    const t = useTitleBarStore();
    t.setPlatform("windows");
    expect(t.padding.right).toBe(WINDOW_CONTROLS_FALLBACK_WIDTH);
    expect(t.effectiveControlsWidth).toBe(WINDOW_CONTROLS_FALLBACK_WIDTH);

    t.setControlsWidth(160);
    expect(t.padding.right).toBe(160);
    expect(t.effectiveControlsWidth).toBe(160);

    // 0 / negative resets to the fallback.
    t.setControlsWidth(0);
    expect(t.padding.right).toBe(WINDOW_CONTROLS_FALLBACK_WIDTH);
    t.setControlsWidth(-10);
    expect(t.controlsWidth).toBe(0);
    expect(t.padding.right).toBe(WINDOW_CONTROLS_FALLBACK_WIDTH);
  });

  it("controlsWidth has no effect on macOS padding", () => {
    const t = useTitleBarStore();
    t.setPlatform("macos");
    t.setControlsWidth(200);
    expect(t.padding).toEqual({ left: TRAFFIC_LIGHT_INSET, right: 12 });
  });

  it("platform computeds are mutually exclusive", () => {
    const t = useTitleBarStore();
    t.setPlatform("linux");
    expect(t.isLinux).toBe(true);
    expect(t.isMacos).toBe(false);
    expect(t.isWindows).toBe(false);
  });
});