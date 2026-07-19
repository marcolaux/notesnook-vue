// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSettingsStore } from "@/stores/settings";
import type { TimeFormat, TrashCleanupInterval, Profile } from "@notesnook-vue/contracts";

// In-memory fake db.settings: each getter reads from _d; setters mutate + the
// store re-reads via the getter (matching core's set-then-get contract).
const db = {
  settings: {
    _d: {
      dateFormat: "DD-MM-YYYY",
      timeFormat: "12-hour" as TimeFormat,
      titleFormat: "Note $date$ $time$",
      trashCleanupInterval: 7 as TrashCleanupInterval,
      defaultNotebook: undefined as string | undefined,
      profile: undefined as Profile | undefined
    },
    getDateFormat: () => db.settings._d.dateFormat,
    setDateFormat: vi.fn(async (f: string) => {
      db.settings._d.dateFormat = f;
      return "id";
    }),
    getTimeFormat: () => db.settings._d.timeFormat,
    setTimeFormat: vi.fn(async (f: TimeFormat) => {
      db.settings._d.timeFormat = f;
      return "id";
    }),
    getTitleFormat: () => db.settings._d.titleFormat,
    setTitleFormat: vi.fn(async (f: string) => {
      db.settings._d.titleFormat = f;
      return "id";
    }),
    getTrashCleanupInterval: () => db.settings._d.trashCleanupInterval,
    setTrashCleanupInterval: vi.fn(async (i: TrashCleanupInterval) => {
      db.settings._d.trashCleanupInterval = i;
      return "id";
    }),
    getDefaultNotebook: () => db.settings._d.defaultNotebook,
    setDefaultNotebook: vi.fn(async (n: string | undefined) => {
      db.settings._d.defaultNotebook = n;
      return "id";
    }),
    getProfile: () => db.settings._d.profile,
    setProfile: vi.fn(async (p: Partial<Profile> | undefined) => {
      db.settings._d.profile = p ? { ...(db.settings._d.profile ?? {}), ...p } : undefined;
      return "id";
    })
  }
};
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

// Map-backed localStorage mock (node has none). Scoped to this file (vitest
// isolates module state per file). Reset between tests so themeMode persistence
// is verifiable from a clean slate.
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
let storage: MemStorage;

/** Reset the fake db + mocks + storage + a fresh pinia before every test. */
function resetState(): void {
  db.settings._d = {
    dateFormat: "DD-MM-YYYY",
    timeFormat: "12-hour",
    titleFormat: "Note $date$ $time$",
    trashCleanupInterval: 7,
    defaultNotebook: undefined,
    profile: undefined
  };
  for (const k of Object.keys(db.settings) as (keyof typeof db.settings)[]) {
    const v = db.settings[k];
    if (typeof v === "function" && "mockClear" in v) (v as { mockClear: () => void }).mockClear();
  }
  storage = new MemStorage();
  (globalThis as { localStorage?: MemStorage }).localStorage = storage;
  setActivePinia(createPinia());
}
beforeEach(resetState);

describe("useSettingsStore — defaults + load", () => {

  it("defaults before load (themeMode from localStorage or 'dark')", () => {
    const s = useSettingsStore();
    expect(s.dateFormat).toBe("DD-MM-YYYY");
    expect(s.timeFormat).toBe("12-hour");
    expect(s.titleFormat).toBe("Note $date$ $time$");
    expect(s.trashCleanupInterval).toBe(7);
    expect(s.defaultNotebook).toBeUndefined();
    expect(s.profile).toBeUndefined();
    expect(s.themeMode).toBe("dark"); // empty localStorage → default
    expect(s.themeChangeSignal).toBe(0);
  });

  it("themeMode is read from localStorage at construction", () => {
    storage.setItem("notesnook.themeMode", "light");
    setActivePinia(createPinia());
    const s = useSettingsStore();
    expect(s.themeMode).toBe("light");
  });

  it("invalid localStorage themeMode falls back to default", () => {
    storage.setItem("notesnook.themeMode", "purple");
    setActivePinia(createPinia());
    const s = useSettingsStore();
    expect(s.themeMode).toBe("dark");
  });

  it("load reads db.settings into the store", async () => {
    db.settings._d.dateFormat = "YYYY-MM-DD";
    db.settings._d.timeFormat = "24-hour";
    db.settings._d.titleFormat = "T $time$";
    db.settings._d.trashCleanupInterval = 30;
    db.settings._d.defaultNotebook = "nb-1";
    db.settings._d.profile = { fullName: "Ada" };
    setActivePinia(createPinia());
    const s = useSettingsStore();
    await s.load();
    expect(s.dateFormat).toBe("YYYY-MM-DD");
    expect(s.timeFormat).toBe("24-hour");
    expect(s.titleFormat).toBe("T $time$");
    expect(s.trashCleanupInterval).toBe(30);
    expect(s.defaultNotebook).toBe("nb-1");
    expect(s.profile).toEqual({ fullName: "Ada" });
  });
});

describe("useSettingsStore — setters", () => {
  it("setDateFormat calls db + updates state", async () => {
    const s = useSettingsStore();
    await s.setDateFormat("MM/DD/YYYY");
    expect(db.settings.setDateFormat).toHaveBeenCalledWith("MM/DD/YYYY");
    expect(s.dateFormat).toBe("MM/DD/YYYY");
  });

  it("setTimeFormat calls db + updates state", async () => {
    const s = useSettingsStore();
    await s.setTimeFormat("24-hour");
    expect(db.settings.setTimeFormat).toHaveBeenCalledWith("24-hour");
    expect(s.timeFormat).toBe("24-hour");
  });

  it("setTitleFormat calls db + updates state", async () => {
    const s = useSettingsStore();
    await s.setTitleFormat("New $date$");
    expect(s.titleFormat).toBe("New $date$");
  });

  it("setTrashCleanupInterval calls db + updates state", async () => {
    const s = useSettingsStore();
    await s.setTrashCleanupInterval(365);
    expect(db.settings.setTrashCleanupInterval).toHaveBeenCalledWith(365);
    expect(s.trashCleanupInterval).toBe(365);
  });

  it("setDefaultNotebook + clear (undefined) round-trips", async () => {
    const s = useSettingsStore();
    await s.setDefaultNotebook("nb-2");
    expect(db.settings.setDefaultNotebook).toHaveBeenCalledWith("nb-2");
    expect(s.defaultNotebook).toBe("nb-2");
    await s.setDefaultNotebook(undefined);
    expect(db.settings.setDefaultNotebook).toHaveBeenCalledWith(undefined);
    expect(s.defaultNotebook).toBeUndefined();
  });

  it("setProfile merges + re-reads the full profile", async () => {
    const s = useSettingsStore();
    await s.setProfile({ fullName: "Ada" });
    expect(s.profile).toEqual({ fullName: "Ada" });
    await s.setProfile({ profilePicture: "img" });
    expect(s.profile).toEqual({ fullName: "Ada", profilePicture: "img" });
    await s.setProfile(undefined);
    expect(s.profile).toBeUndefined();
  });

  it("setThemeMode updates state + persists + bumps the signal", () => {
    const s = useSettingsStore();
    expect(s.themeMode).toBe("dark");
    s.setThemeMode("system");
    expect(s.themeMode).toBe("system");
    expect(s.themeChangeSignal).toBe(1);
    expect(storage.getItem("notesnook.themeMode")).toBe("system");
    s.setThemeMode("light");
    expect(s.themeChangeSignal).toBe(2);
    expect(storage.getItem("notesnook.themeMode")).toBe("light");
  });

  it("setter failure leaves the previous value intact (never throws)", async () => {
    const s = useSettingsStore();
    await s.setDateFormat("YYYY-MM-DD");
    expect(s.dateFormat).toBe("YYYY-MM-DD");
    (db.settings.setDateFormat as { mockRejectedValueOnce: (e: unknown) => void }).mockRejectedValueOnce(
      new Error("boom")
    );
    await s.setDateFormat("bad");
    expect(s.dateFormat).toBe("YYYY-MM-DD"); // unchanged
  });

  it("load failure leaves previous values intact (never throws)", async () => {
    const s = useSettingsStore();
    await s.load();
    expect(s.dateFormat).toBe("DD-MM-YYYY");
    // Force the db to throw on a getter by replacing it for one call.
    const orig = db.settings.getDateFormat;
    db.settings.getDateFormat = () => {
      throw new Error("boom");
    };
    await s.load();
    expect(s.dateFormat).toBe("DD-MM-YYYY"); // unchanged
    db.settings.getDateFormat = orig;
  });
});