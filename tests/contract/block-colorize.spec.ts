// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// The store reads/writes the per-account keys via `getCurrentContext()` from
// bootstrap; mock it so the real (heavy) bootstrap module graph never loads in
// the headless test env. Current context is fixed to "local" so the per-account
// keys are `notesnook.blockColorize.local` / `notesnook.blockColorizeOverrides.local`.
vi.mock("@/platform/bootstrap", () => ({ getCurrentContext: () => "local" }));

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

  it("persists overrides + default to the per-account localStorage key", async () => {
    const s = await freshStore();
    s.toggleBlockColorize("n1");
    s.setBlockColorizeDefault(true);
    expect(storage.getItem("notesnook.blockColorize.local")).toBe("true");
    const persisted = JSON.parse(
      storage.getItem("notesnook.blockColorizeOverrides.local") as string
    );
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

describe("block-colorize store — per-account", () => {
  const HEX = "a1b2c3d4e5f60718";
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
    (globalThis as { localStorage?: MemStorage }).localStorage = storage;
  });

  async function freshStore() {
    vi.resetModules();
    return (await import("@/stores/block-colorize")) as typeof import("@/stores/block-colorize");
  }

  it("setBlockColorizeDefault writes to the ctx-suffixed key, not legacy", async () => {
    const s = await freshStore();
    s.setBlockColorizeDefault(true);
    expect(storage.getItem("notesnook.blockColorize.local")).toBe("true");
    expect(storage.getItem("notesnook.blockColorize")).toBeNull();
  });

  it("reloadBlockColorize(ctx) re-reads that ctx's default + overrides", async () => {
    const s = await freshStore();
    storage.setItem("notesnook.blockColorize." + HEX, "true");
    storage.setItem(
      "notesnook.blockColorizeOverrides." + HEX,
      JSON.stringify({ n9: true })
    );
    s.reloadBlockColorize(HEX);
    expect(s.blockColorizeDefault.value).toBe(true);
    expect(s.blockColorizeOverrides.value.n9).toBe(true);
  });

  it("reloadBlockColorize migrates a legacy value into the ctx key", async () => {
    const s = await freshStore();
    storage.setItem("notesnook.blockColorize", "true"); // legacy
    s.reloadBlockColorize(HEX);
    expect(s.blockColorizeDefault.value).toBe(true);
    expect(storage.getItem("notesnook.blockColorize." + HEX)).toBe("true");
  });

  it("per-account isolation: local writes do not touch another ctx", async () => {
    const s = await freshStore();
    s.setBlockColorizeDefault(true);
    expect(storage.getItem("notesnook.blockColorize." + HEX)).toBeNull();
  });
});