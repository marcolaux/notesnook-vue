// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  isPointOutsideRect,
  shouldTearOffTab,
  resolveTabRelease,
  type ScreenRect,
  type WindowRect
} from "@contracts/tab-tear-off";
import { dropZoneFromPoint } from "@/utils/tab-dnd";

/** Minimal DOMRect-shaped object for `dropZoneFromPoint` (it only reads
 *  left/top/width/height). */
function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height } as DOMRect;
}

// A source window occupying screen x∈[100,1380], y∈[50,850].
const rect: ScreenRect = { left: 100, top: 50, width: 1280, height: 800 };

describe("isPointOutsideRect", () => {
  it("is false for a point inside the rect", () => {
    expect(isPointOutsideRect(500, 400, rect)).toBe(false);
  });
  it("is false on the top-left corner", () => {
    expect(isPointOutsideRect(100, 50, rect)).toBe(false);
  });
  it("is false on the bottom-right corner", () => {
    expect(isPointOutsideRect(1380, 850, rect)).toBe(false);
  });
  it("is true left of the rect", () => {
    expect(isPointOutsideRect(50, 400, rect)).toBe(true);
  });
  it("is true right of the rect", () => {
    expect(isPointOutsideRect(2000, 400, rect)).toBe(true);
  });
  it("is true above the rect", () => {
    expect(isPointOutsideRect(500, 10, rect)).toBe(true);
  });
  it("is true below the rect", () => {
    expect(isPointOutsideRect(500, 1000, rect)).toBe(true);
  });
});

describe("shouldTearOffTab", () => {
  const start = { x: 500, y: 400 };

  it("tears off when the drag ends outside the window with real movement", () => {
    expect(shouldTearOffTab(start.x, start.y, 2000, 400, rect)).toBe(true);
  });

  it("does not tear off when the drag ends inside the window", () => {
    expect(shouldTearOffTab(start.x, start.y, 600, 450, rect)).toBe(false);
  });

  it("does not tear off on a click without movement (end == start)", () => {
    expect(shouldTearOffTab(start.x, start.y, start.x, start.y, rect)).toBe(false);
  });

  it("does not tear off on tiny jitter (sub-threshold movement)", () => {
    // The movement guard's job: a click or a no-op drag that barely moved
    // never tears off.
    expect(shouldTearOffTab(start.x, start.y, start.x + 1, start.y + 1, rect)).toBe(false);
  });

  it("respects a custom minDrag threshold", () => {
    // 3px movement: below default minDrag (4) → no tear; above a minDrag of 2 → tear (but inside window → still no).
    expect(shouldTearOffTab(start.x, start.y, start.x + 3, start.y, rect, 4)).toBe(false);
    // Outside + 3px movement with minDrag 2 → tear.
    expect(shouldTearOffTab(start.x, start.y, 2000, start.y, rect, 2)).toBe(true);
  });

  it("does not tear off when the end is outside but movement is below threshold", () => {
    // Start just inside the right edge; a 2px move lands outside, but it's below
    // the 4px minDrag → no tear.
    const sx = rect.left + rect.width - 1;
    expect(shouldTearOffTab(sx, 400, sx + 2, 400, rect)).toBe(false);
  });
});

describe("resolveTabRelease", () => {
  // Source window A occupies the left half of the screen; window B (another app
  // window) the right half; the Settings window the bottom strip.
  const a: WindowRect = { id: 1, rect: { left: 0, top: 0, width: 800, height: 600 }, isSettings: false };
  const b: WindowRect = { id: 2, rect: { left: 800, top: 0, width: 800, height: 600 }, isSettings: false };
  const settings: WindowRect = { id: 3, rect: { left: 0, top: 600, width: 1600, height: 200 }, isSettings: true };
  const windows = [a, b, settings];

  it("returns 'none' when the drag ends back inside the source window", () => {
    // Started + ended inside A — the renderer already handled it as a within-window drop.
    expect(resolveTabRelease(100, 100, 500, 500, windows)).toEqual({ action: "none" });
  });

  it("returns 'moved' with the target id when the drag ends over another app window", () => {
    // Dragged from A onto B.
    expect(resolveTabRelease(100, 100, 1200, 300, windows)).toEqual({ action: "moved", targetId: 2 });
  });

  it("returns 'moved' to A when dragged from B onto A", () => {
    expect(resolveTabRelease(1200, 300, 100, 100, windows)).toEqual({ action: "moved", targetId: 1 });
  });

  it("does NOT move to the Settings window (it has no editor tabs)", () => {
    // Dragged from A onto the Settings window's rect → not a valid target → tear off instead.
    const res = resolveTabRelease(100, 100, 800, 700, windows);
    expect(res.action).toBe("toreOff");
    expect(res.targetId).toBeUndefined();
  });

  it("returns 'toreOff' when the drag ends outside every window", () => {
    expect(resolveTabRelease(100, 100, 5000, 5000, windows)).toEqual({ action: "toreOff" });
  });

  it("returns 'none' when no window contains the dragstart point", () => {
    expect(resolveTabRelease(5000, 5000, 100, 100, windows)).toEqual({ action: "none" });
  });

  it("ignores destroyed-style entries by relying on the caller's filter (only live windows passed)", () => {
    // The caller filters out destroyed windows before calling; resolveTabRelease
    // just picks the surviving window under the cursor.
    expect(resolveTabRelease(100, 100, 1200, 300, [a, b])).toEqual({ action: "moved", targetId: 2 });
  });
});

describe("dropZoneFromPoint", () => {
  // 1000×800 body at (0,0). Edge bands are the outer 30% (margin 0.3) of each
  // side; the centre is x∈[300,700] ∩ y∈[240,560].
  const r = domRect(0, 0, 1000, 800);

  it("centre → 'center'", () => {
    expect(dropZoneFromPoint(500, 400, r)).toBe("center");
  });

  it("left edge → 'left'", () => {
    expect(dropZoneFromPoint(50, 400, r)).toBe("left");
  });

  it("right edge → 'right'", () => {
    expect(dropZoneFromPoint(950, 400, r)).toBe("right");
  });

  it("top edge → 'top'", () => {
    expect(dropZoneFromPoint(500, 50, r)).toBe("top");
  });

  it("bottom edge → 'bottom'", () => {
    expect(dropZoneFromPoint(500, 770, r)).toBe("bottom");
  });

  it("just inside the band on the centre side is still an edge", () => {
    // x = 290 is within the left band (dx = 0.29 < 0.3) → 'left'.
    expect(dropZoneFromPoint(290, 400, r)).toBe("left");
  });

  it("just past the band into the centre is 'center'", () => {
    // x = 310 → dx = 0.31 > 0.3 → centre (both right/top/bottom also > 0.3).
    expect(dropZoneFromPoint(310, 400, r)).toBe("center");
  });
});