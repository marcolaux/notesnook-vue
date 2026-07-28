// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// Map-backed localStorage mock (node has none). Scoped to this file.
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

// The store keeps module-level refs initialized from localStorage at import
// time, so re-import it fresh after installing the storage mock for isolation.
async function freshStore() {
  vi.resetModules();
  return (await import("@/stores/block-colorize")) as typeof import("@/stores/block-colorize");
}

describe("block-colorize store", () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
    (globalThis as { localStorage?: MemStorage }).localStorage = storage;
  });

  it("defaults to off with no overrides", async () => {
    const s = await freshStore();
    expect(s.blockColorizeDefault.value).toBe(false);
    expect(s.effectiveBlockColorize("n1")).toBe(false);
    expect(s.effectiveBlockColorize(null)).toBe(false);
  });

  it("toggleBlockColorize creates an override, then clears it back to default", async () => {
    const s = await freshStore();
    // default is false → toggling note n1 makes it true (an override).
    s.toggleBlockColorize("n1");
    expect(s.effectiveBlockColorize("n1")).toBe(true);
    expect(s.blockColorizeOverrides.value.n1).toBe(true);
    // n2 is unaffected.
    expect(s.effectiveBlockColorize("n2")).toBe(false);
    // toggling again returns to false == default → override is pruned.
    s.toggleBlockColorize("n1");
    expect(s.effectiveBlockColorize("n1")).toBe(false);
    expect(s.blockColorizeOverrides.value.n1).toBeUndefined();
  });

  it("persists overrides + default to localStorage", async () => {
    const s = await freshStore();
    s.toggleBlockColorize("n1");
    s.setBlockColorizeDefault(true);
    expect(storage.getItem("notesnook.blockColorize")).toBe("true");
    const persisted = JSON.parse(storage.getItem("notesnook.blockColorizeOverrides") as string);
    // n1 was toggled to true, then default became true → override pruned.
    expect(persisted).toEqual({});
  });

  it("setBlockColorizeDefault prunes overrides that now match the default", async () => {
    const s = await freshStore();
    // default false; override n1=true, n2=true.
    s.toggleBlockColorize("n1");
    s.toggleBlockColorize("n2");
    expect(Object.keys(s.blockColorizeOverrides.value)).toHaveLength(2);
    // flip default to true → both overrides (true) match and are pruned.
    s.setBlockColorizeDefault(true);
    expect(s.blockColorizeDefault.value).toBe(true);
    expect(s.blockColorizeOverrides.value).toEqual({});
    expect(s.effectiveBlockColorize("n1")).toBe(true);
  });

  it("toggle with no noteId flips the global default", async () => {
    const s = await freshStore();
    expect(s.blockColorizeDefault.value).toBe(false);
    s.toggleBlockColorize(null);
    expect(s.blockColorizeDefault.value).toBe(true);
    s.toggleBlockColorize(undefined);
    expect(s.blockColorizeDefault.value).toBe(false);
  });

  it("reads persisted state from localStorage on import", async () => {
    storage.setItem("notesnook.blockColorize", "true");
    storage.setItem(
      "notesnook.blockColorizeOverrides",
      JSON.stringify({ n1: false })
    );
    const s = await freshStore();
    expect(s.blockColorizeDefault.value).toBe(true);
    // n1 override false overrides the true default.
    expect(s.effectiveBlockColorize("n1")).toBe(false);
    expect(s.effectiveBlockColorize("n2")).toBe(true);
  });
});