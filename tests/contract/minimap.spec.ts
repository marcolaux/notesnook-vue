// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  minimapScale,
  viewportRect,
  fractionFromPointerY,
  scrollTopFromFraction,
  contentTranslateY,
  MINIMAP_SCALE_FLOOR
} from "@/utils/minimap";

describe("minimapScale", () => {
  it("scales content down to the minimap width", () => {
    expect(minimapScale(800, 80)).toBeCloseTo(0.1);
    expect(minimapScale(1000, 100)).toBeCloseTo(0.1);
  });

  it("floors the scale for very wide content", () => {
    expect(minimapScale(100_000, 80)).toBe(MINIMAP_SCALE_FLOOR);
  });

  it("returns the floor for zero/negative content width", () => {
    expect(minimapScale(0, 80)).toBe(MINIMAP_SCALE_FLOOR);
    expect(minimapScale(-5, 80)).toBe(MINIMAP_SCALE_FLOOR);
  });
});

describe("viewportRect", () => {
  it("covers the whole minimap when content fits the viewport (no scroll)", () => {
    const r = viewportRect({
      scrollTop: 0,
      viewportHeight: 600,
      scrollHeight: 400,
      scale: 0.1,
      minimapHeight: 600
    });
    expect(r.top).toBe(0);
    expect(r.height).toBe(600);
  });

  it("positions the indicator by scroll fraction and sizes it viewportHeight*scale", () => {
    const r = viewportRect({
      scrollTop: 1000,
      viewportHeight: 400,
      scrollHeight: 4000,
      scale: 0.1,
      minimapHeight: 600
    });
    expect(r.height).toBeCloseTo(40); // 400 * 0.1
    // frac = 1000 / (4000-400) = 1000/3600; maxTop = 600-40 = 560
    expect(r.top).toBeCloseTo((1000 / 3600) * 560);
  });

  it("clamps the indicator to the minimap bottom at max scroll", () => {
    const r = viewportRect({
      scrollTop: 3600, // max scrollTop = 4000 - 400 = 3600
      viewportHeight: 400,
      scrollHeight: 4000,
      scale: 0.1,
      minimapHeight: 600
    });
    expect(r.height).toBeCloseTo(40);
    // frac = 1 → top = maxTop = 600 - 40 = 560
    expect(r.top).toBeCloseTo(560);
  });

  it("enforces the minimum indicator height", () => {
    const r = viewportRect({
      scrollTop: 0,
      viewportHeight: 10, // 10 * 0.1 = 1px → below minHeight
      scrollHeight: 4000,
      scale: 0.1,
      minimapHeight: 600,
      minHeight: 24
    });
    expect(r.height).toBe(24);
  });

  it("clamps indicator height to the minimap height when viewport is huge", () => {
    const r = viewportRect({
      scrollTop: 0,
      viewportHeight: 10_000,
      scrollHeight: 4000, // fits → covers whole minimap
      scale: 0.1,
      minimapHeight: 600
    });
    expect(r.top).toBe(0);
    expect(r.height).toBe(600);
  });
});

describe("fractionFromPointerY", () => {
  it("centers the indicator under the cursor", () => {
    // minimap 600, indicator 40 → travel 560; y=300 → (300-20)/560 ≈ 0.5
    expect(fractionFromPointerY(300, 600, 40)).toBeCloseTo((300 - 20) / 560);
  });

  it("clamps below 0 at the top", () => {
    expect(fractionFromPointerY(-100, 600, 40)).toBe(0);
  });

  it("clamps above 1 at the bottom", () => {
    expect(fractionFromPointerY(10_000, 600, 40)).toBe(1);
  });

  it("returns 0 when the indicator fills the minimap (no travel)", () => {
    expect(fractionFromPointerY(300, 600, 600)).toBe(0);
    expect(fractionFromPointerY(300, 600, 700)).toBe(0);
  });
});

describe("scrollTopFromFraction", () => {
  it("maps a fraction to scrollTop", () => {
    expect(scrollTopFromFraction(0.5, 4000, 400)).toBeCloseTo(0.5 * 3600);
    expect(scrollTopFromFraction(0, 4000, 400)).toBe(0);
    expect(scrollTopFromFraction(1, 4000, 400)).toBe(3600);
  });

  it("clamps the fraction to [0,1]", () => {
    expect(scrollTopFromFraction(-1, 4000, 400)).toBe(0);
    expect(scrollTopFromFraction(2, 4000, 400)).toBe(3600);
  });

  it("returns 0 when content does not overflow", () => {
    expect(scrollTopFromFraction(0.5, 400, 600)).toBe(0);
  });
});

describe("contentTranslateY", () => {
  // doc 4000, viewport 400, scale 0.1 → contentH 400, minimap 600 → fits → 0.
  it("is 0 when the whole content fits the minimap", () => {
    expect(
      contentTranslateY({ scrollTop: 100, viewportHeight: 400, scrollHeight: 4000, scale: 0.1, minimapHeight: 600 })
    ).toBe(0);
  });

  // doc 8000, viewport 400, scale 0.1 → contentH 800, minimap 600 → overflows.
  it("keeps the indicator aligned with the editor viewport at the top (scrollTop=0)", () => {
    const t = contentTranslateY({ scrollTop: 0, viewportHeight: 400, scrollHeight: 8000, scale: 0.1, minimapHeight: 600 });
    // indicatorTop = 0 (frac 0) → translate = clamp(0 - 0, -(800-600), 0) = 0
    expect(t).toBe(0);
  });

  it("clamps so the content never scrolls past its bottom", () => {
    const max = 8000 - 400; // 7600
    const t = contentTranslateY({ scrollTop: max, viewportHeight: 400, scrollHeight: 8000, scale: 0.1, minimapHeight: 600 });
    // at max scroll: translate = clamp(indicatorTop - max*0.1, -(800-600), 0) = -200
    expect(t).toBe(-200);
  });

  it("produces a negative translate (content shifted up) mid-document", () => {
    const t = contentTranslateY({ scrollTop: 2000, viewportHeight: 400, scrollHeight: 8000, scale: 0.1, minimapHeight: 600 });
    expect(t).toBeLessThanOrEqual(0);
    expect(t).toBeGreaterThanOrEqual(-200);
  });
});