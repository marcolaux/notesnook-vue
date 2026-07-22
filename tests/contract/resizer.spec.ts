// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  clampWidth,
  applyDrag,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  SIDEBAR_DEFAULT,
  LIST_MIN,
  LIST_MAX,
  LIST_DEFAULT
} from "@/utils/resizer";
import { useShellStore } from "@/stores/shell";

// Map-backed localStorage mock (node has none). Mirrors config.spec.ts.
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

describe("resizer utils", () => {
  it("clampWidth clamps to the bounds", () => {
    expect(clampWidth(300, 200, 500)).toBe(300);
    expect(clampWidth(100, 200, 500)).toBe(200);
    expect(clampWidth(999, 200, 500)).toBe(500);
    expect(clampWidth(200, 200, 500)).toBe(200);
    expect(clampWidth(500, 200, 500)).toBe(500);
  });

  it("clampWidth maps NaN to min (bad stored value)", () => {
    expect(clampWidth(Number.NaN, 200, 500)).toBe(200);
  });

  it("applyDrag adds deltaX then clamps", () => {
    expect(applyDrag(300, 50, 200, 500)).toBe(350);
    expect(applyDrag(300, -100, 200, 500)).toBe(200);
    expect(applyDrag(300, 999, 200, 500)).toBe(500);
    expect(applyDrag(300, -999, 200, 500)).toBe(200);
    expect(applyDrag(300, 0, 200, 500)).toBe(300);
  });
});

describe("shell store resizable widths", () => {
  let storage: MemStorage;

  beforeEach(() => {
    setActivePinia(createPinia());
    storage = new MemStorage();
    (globalThis as { localStorage?: MemStorage }).localStorage = storage;
  });

  it("defaults when localStorage is empty", () => {
    const s = useShellStore();
    expect(s.sidebarWidth).toBe(SIDEBAR_DEFAULT);
    expect(s.listWidth).toBe(LIST_DEFAULT);
  });

  it("reads + clamps a persisted sidebar width", () => {
    storage.setItem("notesnook.config.sidebarWidth", "300");
    const s = useShellStore();
    expect(s.sidebarWidth).toBe(300);
  });

  it("clamps an out-of-bounds persisted sidebar width on read", () => {
    storage.setItem("notesnook.config.sidebarWidth", "9999");
    const s = useShellStore();
    expect(s.sidebarWidth).toBe(SIDEBAR_MAX);
  });

  it("falls back to default on a corrupted (non-number) stored value", () => {
    storage.setItem("notesnook.config.listWidth", '"wide"');
    const s = useShellStore();
    expect(s.listWidth).toBe(LIST_DEFAULT);
  });

  it("setSidebarWidth clamps + writes through to localStorage", () => {
    const s = useShellStore();
    s.setSidebarWidth(9999);
    expect(s.sidebarWidth).toBe(SIDEBAR_MAX);
    expect(storage.getItem("notesnook.config.sidebarWidth")).toBe(String(SIDEBAR_MAX));

    s.setSidebarWidth(10);
    expect(s.sidebarWidth).toBe(SIDEBAR_MIN);
    expect(storage.getItem("notesnook.config.sidebarWidth")).toBe(String(SIDEBAR_MIN));

    s.setSidebarWidth(250);
    expect(s.sidebarWidth).toBe(250);
    expect(storage.getItem("notesnook.config.sidebarWidth")).toBe("250");
  });

  it("setListWidth clamps + writes through to localStorage", () => {
    const s = useShellStore();
    s.setListWidth(9999);
    expect(s.listWidth).toBe(LIST_MAX);
    expect(storage.getItem("notesnook.config.listWidth")).toBe(String(LIST_MAX));

    s.setListWidth(10);
    expect(s.listWidth).toBe(LIST_MIN);
    expect(storage.getItem("notesnook.config.listWidth")).toBe(String(LIST_MIN));
  });

  it("survives a restart: a fresh store reads the persisted value", () => {
    const s = useShellStore();
    s.setSidebarWidth(420);
    s.setListWidth(300);
    // Simulate a reload: new pinia, same localStorage.
    setActivePinia(createPinia());
    const s2 = useShellStore();
    expect(s2.sidebarWidth).toBe(420);
    expect(s2.listWidth).toBe(300);
  });
});