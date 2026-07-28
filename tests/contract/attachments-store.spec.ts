// @vitest-environment node
/**
 * Attachments store — db orchestration against a fake `db.attachments` +
 * `db.relations` (mirrors the `settings.spec.ts` fake-db pattern). Proves the
 * store's deterministic paths without Electron: load (+ counts/sizes per
 * filter), setFilter, remove (+ notifyDataChanged + reload), removeOrphaned,
 * loadUsage (relations.resolve), openNote (desktop.window.openNote), and
 * failure isolation (never-throw). The real encrypted round-trip + the core
 * `orphaned`/`linked` selectors are covered in `attachments-real-db.spec.ts`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Attachment, Note, Database } from "@notesnook-vue/contracts";

// --- mocks: bootstrap getDatabase + desktop-bridge ---------------------------
const dbRef = vi.hoisted(() => {
  let db: Database | undefined;
  return {
    getDatabase: () => db,
    setDatabase: (d: Database) => {
      db = d;
    }
  };
});
vi.mock("@/platform/bootstrap", () => ({
  getCurrentContext: () => "local",
  getDatabase: dbRef.getDatabase,
  bootstrap: vi.fn()
}));

const desktopMocks = vi.hoisted(() => ({
  openNote: vi.fn(async (_input: { noteId: string }) => undefined),
  notifyDataChanged: vi.fn(async () => undefined)
}));
vi.mock("@/platform/desktop-bridge", () => ({
  desktop: {
    window: {
      openNote: { mutate: desktopMocks.openNote },
      notifyDataChanged: { mutate: desktopMocks.notifyDataChanged }
    }
  }
}));

const { useAttachmentsStore } = await import("@/stores/attachments");

/** Build a minimal `Attachment`-shaped object (cast — only the fields the
 *  store + tests read are populated). */
function att(id: string, hash: string, mime: string, size: number, filename = `${id}.bin`): Attachment {
  return {
    id,
    type: "attachment",
    hash,
    hashType: "sha256",
    filename,
    mimeType: mime,
    size,
    iv: "",
    salt: "",
    alg: "",
    chunkSize: 0,
    key: "" as never,
    dateCreated: 0,
    dateModified: 0,
    localOnly: false,
    synced: false
  } as unknown as Attachment;
}

/** A fake `FilteredSelector`-like over a fixed list. */
function selector(list: Attachment[]) {
  return {
    items: async () => list,
    count: async () => list.length,
    ids: async () => list.map((a) => a.id)
  };
}

/** Build a fake db whose media-type selectors filter `all` by mime prefix,
 *  `orphaned` is the explicit orphan subset, and `totalSize` sums `size`. */
function makeDb(all: Attachment[], orphanedIds: Set<string>) {
  const orphaned = all.filter((a) => orphanedIds.has(a.id));
  const byPrefix = (p: string) => all.filter((a) => a.mimeType.startsWith(p));
  return {
    attachments: {
      all: selector(all),
      images: selector(byPrefix("image/")),
      videos: selector(byPrefix("video/")),
      audios: selector(byPrefix("audio/")),
      documents: selector(all.filter((a) => a.mimeType.startsWith("application/"))),
      orphaned: selector(orphaned),
      totalSize: vi.fn(async (sel: { items: () => Promise<Attachment[]> }) =>
        (await sel.items()).reduce((s, a) => s + a.size, 0)
      ),
      remove: vi.fn(async (_hashOrId: string, _localOnly: boolean) => true),
      attachment: vi.fn(async (hashOrId: string) =>
        all.find((a) => a.hash === hashOrId || a.id === hashOrId)
      )
    },
    relations: {
      to: vi.fn((ref: { id: string; type: string }) => ({
        resolve: async () =>
          (ref.id === "a1" ? ([{ id: "n1", title: "Note one" }] as Note[]) : []) as Note[]
      }))
    }
  } as unknown as Database;
}

const ALL = [
  att("a1", "h1", "image/png", 1000, "pic.png"),
  att("a2", "h2", "application/pdf", 2000, "doc.pdf"),
  att("a3", "h3", "image/jpeg", 3000, "orphan.jpg")
];
const ORPHANED = new Set(["a3"]);

function resetMocks(): void {
  dbRef.setDatabase(makeDb(ALL, ORPHANED));
  desktopMocks.openNote.mockClear();
  desktopMocks.notifyDataChanged.mockClear();
}

beforeEach(() => {
  setActivePinia(createPinia());
  resetMocks();
});

describe("useAttachmentsStore — load + counts", () => {
  it("load() populates items + all 6 counts + sizes for the active filter", async () => {
    const s = useAttachmentsStore();
    await s.load();
    expect(s.filter).toBe("all");
    expect(s.items.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(s.counts).toEqual({ all: 3, images: 2, videos: 0, audios: 0, documents: 1, orphaned: 1 });
    expect(s.totalBytes).toBe(6000); // 1000 + 2000 + 3000
    expect(s.orphanedBytes).toBe(3000);
    expect([...s.orphanedIds]).toEqual(["a3"]);
    expect(s.loading).toBe(false);
    expect(s.error).toBeUndefined();
  });

  it("setFilter('orphaned') reloads just the orphaned subset", async () => {
    const s = useAttachmentsStore();
    await s.load();
    await s.setFilter("orphaned");
    expect(s.filter).toBe("orphaned");
    expect(s.items.map((a) => a.id)).toEqual(["a3"]);
    expect(s.totalBytes).toBe(3000);
  });

  it("setFilter('images') reloads the image subset", async () => {
    const s = useAttachmentsStore();
    await s.setFilter("images");
    expect(s.items.map((a) => a.id)).toEqual(["a1", "a3"]);
  });
});

describe("useAttachmentsStore — remove", () => {
  it("remove() calls db.attachments.remove(hash,false), signals, and reloads", async () => {
    const s = useAttachmentsStore();
    await s.load();
    const db = dbRef.getDatabase() as unknown as ReturnType<typeof makeDb>;
    const ok = await s.remove(ALL[0]!);
    expect(ok).toBe(true);
    expect(db.attachments.remove).toHaveBeenCalledWith("h1", false);
    expect(desktopMocks.notifyDataChanged).toHaveBeenCalledTimes(1);
    // reload happened (items re-fetched)
    expect(s.items.length).toBe(3);
  });

  it("remove() is never-throw: a rejecting remove sets error + returns false", async () => {
    const s = useAttachmentsStore();
    await s.load();
    const db = dbRef.getDatabase() as unknown as ReturnType<typeof makeDb>;
    (db.attachments.remove as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("inside a locked note")
    );
    const ok = await s.remove(ALL[0]!);
    expect(ok).toBe(false);
    expect(s.error).toBe("inside a locked note");
  });
});

describe("useAttachmentsStore — removeOrphaned", () => {
  it("removeOrphaned() loops remove(hash,false) over the orphaned selector + signals", async () => {
    const s = useAttachmentsStore();
    await s.load();
    const db = dbRef.getDatabase() as unknown as ReturnType<typeof makeDb>;
    const ok = await s.removeOrphaned();
    expect(ok).toBe(true);
    // The orphaned subset is [a3] (hash "h3") — remove is called once per orphan.
    expect(db.attachments.remove).toHaveBeenCalledWith("h3", false);
    expect(db.attachments.remove).toHaveBeenCalledTimes(1);
    expect(desktopMocks.notifyDataChanged).toHaveBeenCalledTimes(1);
  });
});

describe("useAttachmentsStore — loadUsage", () => {
  it("loadUsage() resolves linked notes via db.relations.to(...).resolve()", async () => {
    const s = useAttachmentsStore();
    await s.load();
    const notes = await s.loadUsage(ALL[0]!);
    expect(notes.map((n) => n.id)).toEqual(["n1"]);
    expect(s.usage["h1"]?.map((n) => n.id)).toEqual(["n1"]);
    const db = dbRef.getDatabase() as unknown as ReturnType<typeof makeDb>;
    expect(db.relations.to).toHaveBeenCalledWith(
      { id: "a1", type: "attachment" },
      "note"
    );
  });

  it("loadUsage() resolves to [] for an attachment with no links", async () => {
    const s = useAttachmentsStore();
    await s.load();
    const notes = await s.loadUsage(ALL[1]!); // a2 → relations fake returns []
    expect(notes).toEqual([]);
    expect(s.usage["h2"]).toEqual([]);
  });

  it("loadUsage() is never-throw: a rejecting resolve yields []", async () => {
    const s = useAttachmentsStore();
    await s.load();
    const db = dbRef.getDatabase() as unknown as ReturnType<typeof makeDb>;
    (db.relations.to as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      resolve: async () => {
        throw new Error("boom");
      }
    }));
    const notes = await s.loadUsage(ALL[0]!);
    expect(notes).toEqual([]);
    expect(s.usage["h1"]).toEqual([]);
  });
});

describe("useAttachmentsStore — openNote", () => {
  it("openNote() calls desktop.window.openNote.mutate({noteId})", async () => {
    const s = useAttachmentsStore();
    await s.openNote("n1");
    expect(desktopMocks.openNote).toHaveBeenCalledWith({ noteId: "n1" });
  });

  it("openNote() is never-throw", async () => {
    const s = useAttachmentsStore();
    desktopMocks.openNote.mockRejectedValueOnce(new Error("no bridge"));
    await expect(s.openNote("n1")).resolves.toBeUndefined();
  });
});

describe("useAttachmentsStore — load failure isolation", () => {
  it("load() sets error + leaves previous list when the db throws", async () => {
    const s = useAttachmentsStore();
    await s.load();
    expect(s.items.length).toBe(3);
    // Swap to a db whose `all` selector throws.
    const bad = makeDb(ALL, ORPHANED);
    (bad.attachments.all as unknown as { items: () => Promise<Attachment[]> }).items = async () => {
      throw new Error("disk gone");
    };
    dbRef.setDatabase(bad);
    await s.load();
    expect(s.error).toBe("disk gone");
    expect(s.items.length).toBe(3); // previous list retained
  });
});