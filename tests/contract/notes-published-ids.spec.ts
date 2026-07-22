// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useNotesStore } from "@/stores/notes";

/** Minimal db mock — `loadPublishedIds` only touches `db.monographs.refresh`
 *  + `db.monographs.all.ids()`. */
const db = {
  monographs: {
    refresh: vi.fn(async () => {}),
    all: {
      ids: vi.fn(async () => ["a", "c"])
    }
  }
};

vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

describe("useNotesStore.publishedIds", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    db.monographs.refresh.mockClear();
    db.monographs.all.ids.mockClear();
  });

  it("starts empty", () => {
    const notes = useNotesStore();
    expect(notes.publishedIds instanceof Set).toBe(true);
    expect(notes.publishedIds.size).toBe(0);
  });

  it("loadPublishedIds refreshes the cache then populates the set from all.ids()", async () => {
    const notes = useNotesStore();
    await notes.loadPublishedIds();
    expect(db.monographs.refresh).toHaveBeenCalled();
    expect(db.monographs.all.ids).toHaveBeenCalled();
    expect(notes.publishedIds.has("a")).toBe(true);
    expect(notes.publishedIds.has("c")).toBe(true);
    expect(notes.publishedIds.has("b")).toBe(false);
  });

  it("refreshes the cache BEFORE reading ids (order matters — cache is empty until refresh)", async () => {
    const order: string[] = [];
    db.monographs.refresh.mockImplementationOnce(async () => {
      order.push("refresh");
    });
    db.monographs.all.ids.mockImplementationOnce(async () => {
      order.push("ids");
      return ["a"];
    });
    const notes = useNotesStore();
    await notes.loadPublishedIds();
    expect(order).toEqual(["refresh", "ids"]);
  });

  it("a failure leaves the previous set intact (never throws)", async () => {
    const notes = useNotesStore();
    await notes.loadPublishedIds();
    expect(notes.publishedIds.size).toBe(2);
    db.monographs.all.ids.mockRejectedValueOnce(new Error("boom"));
    await expect(notes.loadPublishedIds()).resolves.toBeUndefined();
    expect(notes.publishedIds.size).toBe(2); // unchanged
  });
});