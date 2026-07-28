// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useTemplateNotebooksStore } from "@/stores/template-notebooks";

// `template-notebooks.ts` reads/writes via `getDatabase().settings.collection`
// (the custom-settings bypass). Stub the bootstrap so the sodium/crypto graph
// isn't pulled in; the fake settings collection is an in-memory map-backed row
// store that mimics `SQLCollection.get`/`upsert`.
interface Row {
  id: string;
  key: string;
  value: string;
  type: string;
  dateCreated: number;
  dateModified: number;
}
let rows: Map<string, Row>;

let mockDb: { settings: { collection: { get: (id: string) => Row | undefined; upsert: (r: Row) => Promise<void> } } };
vi.mock("@/platform/bootstrap", () => ({
  getCurrentContext: () => "local",
  getDatabase: () => mockDb,
  bootstrap: vi.fn()
}));

beforeEach(() => {
  setActivePinia(createPinia());
  rows = new Map();
  mockDb = {
    settings: {
      collection: {
        get: (id: string) => rows.get(id),
        upsert: async (r: Row) => {
          rows.set(r.id, { ...r });
        }
      }
    }
  };
});

describe("useTemplateNotebooksStore", () => {
  it("getPolicy returns a 'none' policy for an unknown template", () => {
    const store = useTemplateNotebooksStore();
    expect(store.getPolicy("nope")).toEqual({ mode: "none", notebookId: null });
  });

  it("setPolicy updates the ref immediately and getPolicy reflects it", () => {
    const store = useTemplateNotebooksStore();
    store.setPolicy("t1", { mode: "ask", notebookId: null });
    expect(store.getPolicy("t1")).toEqual({ mode: "ask", notebookId: null });
    store.setPolicy("t1", { mode: "fixed", notebookId: "nb1" });
    expect(store.getPolicy("t1")).toEqual({ mode: "fixed", notebookId: "nb1" });
  });

  it("clearPolicy removes the entry (reverts to 'none')", () => {
    const store = useTemplateNotebooksStore();
    store.setPolicy("t1", { mode: "fixed", notebookId: "nb1" });
    store.clearPolicy("t1");
    expect(store.getPolicy("t1")).toEqual({ mode: "none", notebookId: null });
    // clearPolicy on a missing entry is a no-op (no throw).
    store.clearPolicy("never");
  });

  it("load round-trips a persisted map (survives re-instantiation)", async () => {
    // First instance: set policies + flush the debounced write synchronously.
    const store = useTemplateNotebooksStore();
    store.setPolicy("t1", { mode: "fixed", notebookId: "nb1" });
    store.setPolicy("t2", { mode: "ask", notebookId: null });
    store.saveNow();
    // Allow the async upsert to settle.
    await Promise.resolve();
    await Promise.resolve();

    // A fresh store (new Pinia) loads from the same in-memory row.
    setActivePinia(createPinia());
    const reloaded = useTemplateNotebooksStore();
    await reloaded.load();
    expect(reloaded.getPolicy("t1")).toEqual({ mode: "fixed", notebookId: "nb1" });
    expect(reloaded.getPolicy("t2")).toEqual({ mode: "ask", notebookId: null });
    expect(reloaded.getPolicy("t3")).toEqual({ mode: "none", notebookId: null });
  });

  it("load tolerates a missing row (empty map, no throw)", async () => {
    const store = useTemplateNotebooksStore();
    await store.load();
    expect(store.getPolicy("t1")).toEqual({ mode: "none", notebookId: null });
  });

  it("load ignores malformed entries (bad mode / bad notebookId) but keeps valid ones", async () => {
    const store = useTemplateNotebooksStore();
    rows.set(
      // The row id is makeId("custom:templateNotebook"); we don't need the real
      // id here because the test's mock `get` is keyed by whatever load asks for.
      // The store computes ROW_ID via makeId; place a value under that key by
      // writing through a first saveNow, then corrupt the stored JSON.
      "seed",
      { id: "seed", key: "custom:templateNotebook", type: "settingitem", dateCreated: 1, dateModified: 1,
        value: JSON.stringify({
          good: { mode: "fixed", notebookId: "nb1" },
          badMode: { mode: "weird", notebookId: "x" },
          badNb: { mode: "fixed", notebookId: 123 },
          noObj: "not-an-object"
        })
      }
    );
    // Redirect the store's ROW_ID lookup to the "seed" row by overriding get.
    mockDb.settings.collection.get = () => rows.get("seed");
    await store.load();
    expect(store.getPolicy("good")).toEqual({ mode: "fixed", notebookId: "nb1" });
    expect(store.getPolicy("badMode")).toEqual({ mode: "none", notebookId: null });
    // A non-string notebookId is coerced to null; the valid mode is kept (a
    // "fixed" policy with a null notebookId behaves as "none" in notes.create).
    expect(store.getPolicy("badNb")).toEqual({ mode: "fixed", notebookId: null });
    expect(store.getPolicy("noObj")).toEqual({ mode: "none", notebookId: null });
  });
});