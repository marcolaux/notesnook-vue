// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  countWords,
  cursorLineCol,
  readEditorStats,
  formatSyncRelative,
  syncStatusText,
  type EditorLike
} from "@/utils/status";
import { useStatusStore } from "@/stores/status";

// status.ts imports `getDatabase` from bootstrap; stub it so the platform
// graph (sodium/crypto/bridge) isn't loaded for a pure store-logic test.
let lastSyncedMock = 0;
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => ({
    lastSynced: async () => lastSyncedMock
  }),
  bootstrap: vi.fn()
}));

function editor(text: string, pos: number, before?: string): EditorLike {
  return {
    getText: () => text,
    state: {
      selection: { $from: { pos } },
      doc: {
        textBetween: () => (before ?? text.slice(0, pos))
      }
    }
  };
}

describe("countWords", () => {
  it("empty / whitespace-only → 0", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\t  ")).toBe(0);
  });

  it("counts whitespace-separated tokens", () => {
    expect(countWords("hello world")).toBe(2);
    expect(countWords("a b c d e")).toBe(5);
  });

  it("collapses runs of whitespace", () => {
    expect(countWords("a    b\n\n\nc")).toBe(3);
  });
});

describe("cursorLineCol", () => {
  it("single line: column = length + 1", () => {
    expect(cursorLineCol("hello")).toEqual({ line: 1, column: 6 });
    expect(cursorLineCol("")).toEqual({ line: 1, column: 1 });
  });

  it("second line after a newline", () => {
    expect(cursorLineCol("hello\nwor")).toEqual({ line: 2, column: 4 });
  });

  it("cursor at the start of the second line", () => {
    expect(cursorLineCol("hello\n")).toEqual({ line: 2, column: 1 });
  });

  it("third line mid-text", () => {
    expect(cursorLineCol("a\nbb\nccc")).toEqual({ line: 3, column: 4 });
  });
});

describe("readEditorStats", () => {
  it("reads word count + cursor from the editor", () => {
    const e = editor("a b\nc d", 4, "a b\n");
    expect(readEditorStats(e)).toEqual({
      wordCount: 4,
      charCount: 7, // "a b\nc d"
      cursorLine: 2,
      cursorColumn: 1
    });
  });

  it("empty editor → 0 words, line 1 col 1", () => {
    const e = editor("", 0, "");
    expect(readEditorStats(e)).toEqual({ wordCount: 0, charCount: 0, cursorLine: 1, cursorColumn: 1 });
  });
});

describe("formatSyncRelative", () => {
  const NOW = new Date(2026, 6, 19, 12, 0, 0).getTime();
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  it("never synced when lastSynced is 0", () => {
    expect(formatSyncRelative(0, NOW)).toBe("Never synced");
  });

  it("Just now under a minute", () => {
    expect(formatSyncRelative(NOW - 30_000, NOW)).toBe("Just now");
    expect(formatSyncRelative(NOW, NOW)).toBe("Just now");
  });

  it("minutes ago under an hour", () => {
    expect(formatSyncRelative(NOW - 5 * MIN, NOW)).toBe("5m ago");
  });

  it("hours ago under a day", () => {
    expect(formatSyncRelative(NOW - 3 * HOUR, NOW)).toBe("3h ago");
  });

  it("Yesterday for 1–2 days ago", () => {
    expect(formatSyncRelative(NOW - DAY - 1, NOW)).toBe("Yesterday");
    expect(formatSyncRelative(NOW - 2 * DAY + 1, NOW)).toBe("Yesterday");
  });

  it("same year → month + day only", () => {
    // 60 days earlier in 2026 — same calendar year.
    const earlierTs = new Date(2026, 4, 20, 12, 0, 0).getTime();
    const out = formatSyncRelative(earlierTs, NOW);
    const expected = new Date(earlierTs).toLocaleDateString([], { month: "short", day: "numeric" });
    expect(out).toBe(expected);
  });

  it("previous year → month + day + year", () => {
    const earlierTs = new Date(2024, 0, 5, 12, 0, 0).getTime();
    const out = formatSyncRelative(earlierTs, NOW);
    const expected = new Date(earlierTs).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    expect(out).toBe(expected);
  });
});

describe("syncStatusText", () => {
  const NOW = new Date(2026, 6, 19, 12, 0, 0).getTime();

  it("not logged in → Local only (regardless of state)", () => {
    expect(syncStatusText(false, "syncing", 0, NOW)).toBe("Local only");
    expect(syncStatusText(false, "synced", NOW - 1000, NOW)).toBe("Local only");
  });

  it("syncing → Syncing…", () => {
    expect(syncStatusText(true, "syncing", 0, NOW)).toBe("Syncing…");
  });

  it("error → Sync error", () => {
    expect(syncStatusText(true, "error", 0, NOW)).toBe("Sync error");
  });

  it("idle + never synced → Never synced", () => {
    expect(syncStatusText(true, "idle", 0, NOW)).toBe("Never synced");
  });

  it("synced → relative time", () => {
    expect(syncStatusText(true, "synced", NOW - 5 * 60_000, NOW)).toBe("5m ago");
  });
});

describe("useStatusStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    lastSyncedMock = 0;
  });

  it("defaults to idle/never + origin cursor", () => {
    const s = useStatusStore();
    expect(s.syncState).toBe("idle");
    expect(s.lastSynced).toBe(0);
    expect(s.wordCount).toBe(0);
    expect(s.cursorLine).toBe(1);
    expect(s.cursorColumn).toBe(1);
  });

  it("setEditorStats updates the editor fields", () => {
    const s = useStatusStore();
    s.setEditorStats({ wordCount: 42, charCount: 300, cursorLine: 7, cursorColumn: 3 });
    expect(s.wordCount).toBe(42);
    expect(s.charCount).toBe(300);
    expect(s.cursorLine).toBe(7);
    expect(s.cursorColumn).toBe(3);
  });

  it("refreshSync reads lastSynced and settles to synced", async () => {
    const s = useStatusStore();
    lastSyncedMock = 12345;
    await s.refreshSync();
    expect(s.lastSynced).toBe(12345);
    expect(s.syncState).toBe("synced");
  });

  it("refreshSync with no lastSynced → idle", async () => {
    const s = useStatusStore();
    lastSyncedMock = 0;
    await s.refreshSync();
    expect(s.lastSynced).toBe(0);
    expect(s.syncState).toBe("idle");
  });

  it("bindSyncEvents is idempotent (no throw on repeat calls)", () => {
    const s = useStatusStore();
    expect(() => {
      s.bindSyncEvents();
      s.bindSyncEvents();
      s.bindSyncEvents();
    }).not.toThrow();
  });
});