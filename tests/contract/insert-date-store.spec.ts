// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useInsertDateStore } from "@/stores/insert-date";
import { isoDate } from "@/utils/daily-notes";

/** A fake TipTap editor that records the chain methods invoked on it. */
function fakeEditor(): { editor: any; calls: string[] } {
  const calls: string[] = [];
  const chain = {
    focus() {
      calls.push("focus");
      return chain;
    },
    insertContent(s: string) {
      calls.push(`insertContent:${s}`);
      return chain;
    },
    run() {
      calls.push("run");
      return chain;
    }
  };
  return { editor: { isDestroyed: false, chain: () => chain }, calls };
}

beforeEach(() => setActivePinia(createPinia()));

describe("useInsertDateStore", () => {
  it("openFor selects today + opens; close clears", () => {
    const s = useInsertDateStore();
    const { editor } = fakeEditor();
    s.openFor(editor, 10, 20);
    expect(s.open).toBe(true);
    expect(s.x).toBe(10);
    expect(s.y).toBe(20);
    expect(s.selected).toMatch(/^\d{4}-\d{2}-\d{2}$/); // today's ISO
    s.close();
    expect(s.open).toBe(false);
    expect(s.editor).toBeNull();
  });

  it("shiftDays(±1) shifts the selected date by one day and is reversible", () => {
    const s = useInsertDateStore();
    const { editor } = fakeEditor();
    s.openFor(editor, 0, 0);
    const today = s.selected;
    s.shiftDays(1);
    expect(s.selected).not.toBe(today);
    s.shiftDays(-1);
    expect(s.selected).toBe(today);
  });

  it("shiftDays(7) moves a week ahead; shiftMonths crosses month boundaries clamping the day", () => {
    const s = useInsertDateStore();
    const { editor } = fakeEditor();
    s.openFor(editor, 0, 0);
    s.selected = isoDate(new Date(2026, 6, 10)); // 2026-07-10
    s.shiftDays(7);
    expect(s.selected).toBe("2026-07-17");
    // Clamp: Jan 31 + 1 month → Feb 28 (2026 is not a leap year).
    s.selected = isoDate(new Date(2026, 0, 31));
    s.shiftMonths(1);
    expect(s.selected).toBe("2026-02-28");
  });

  it("goToMonthStart/End move to the first/last day of the selected month", () => {
    const s = useInsertDateStore();
    const { editor } = fakeEditor();
    s.openFor(editor, 0, 0);
    s.selected = isoDate(new Date(2026, 1, 15));
    s.goToMonthStart();
    expect(s.selected).toBe("2026-02-01");
    s.goToMonthEnd();
    expect(s.selected).toBe("2026-02-28");
  });

  it("choose(iso) sets the selected date and inserts it immediately", () => {
    const s = useInsertDateStore();
    const { editor, calls } = fakeEditor();
    s.openFor(editor, 0, 0);
    s.choose("2026-07-29");
    expect(s.open).toBe(false);
    expect(calls).toEqual(["focus", "insertContent:2026-07-29 ", "run"]);
  });

  it("confirm inserts `${iso} ` (trailing space) and closes", () => {
    const s = useInsertDateStore();
    const { editor, calls } = fakeEditor();
    s.openFor(editor, 0, 0);
    const iso = s.selected;
    s.confirm();
    expect(s.open).toBe(false);
    expect(calls).toEqual(["focus", `insertContent:${iso} `, "run"]);
  });

  it("confirm is a no-op (no throw) when the editor is destroyed", () => {
    const s = useInsertDateStore();
    const editor = {
      isDestroyed: true,
      chain: () => {
        throw new Error("should not be called");
      }
    } as any;
    s.openFor(editor, 0, 0);
    expect(() => s.confirm()).not.toThrow();
    expect(s.open).toBe(false);
  });

  it("shiftDays is a no-op when the picker is closed", () => {
    const s = useInsertDateStore();
    const before = s.selected;
    s.shiftDays(1);
    expect(s.selected).toBe(before);
  });
});