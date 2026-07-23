// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSettingsStore } from "@/stores/settings";
import type { TimeFormat, TrashCleanupInterval, Profile, DayFormat, WeekFormat } from "@notesnook-vue/contracts";
import { ThemeDark, ThemeLight } from "@notesnook-vue/theme-vue";

// In-memory fake db.settings: each getter reads from _d; setters mutate + the
// store re-reads via the getter (matching core's set-then-get contract).
const db = {
  settings: {
    _d: {
      dateFormat: "DD-MM-YYYY",
      timeFormat: "12-hour" as TimeFormat,
      titleFormat: "Note $date$ $time$",
      dayFormat: "long" as DayFormat,
      weekFormat: "Mon" as WeekFormat,
      trashCleanupInterval: 7 as TrashCleanupInterval,
      defaultNotebook: undefined as string | undefined,
      defaultTag: undefined as string | undefined,
      vaultLockAfter: 1000 * 60 * 30 as number,
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
    getDayFormat: () => db.settings._d.dayFormat,
    setDayFormat: vi.fn(async (f: DayFormat) => {
      db.settings._d.dayFormat = f;
      return "id";
    }),
    getWeekFormat: () => db.settings._d.weekFormat,
    setWeekFormat: vi.fn(async (f: WeekFormat) => {
      db.settings._d.weekFormat = f;
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
    getDefaultTag: () => db.settings._d.defaultTag,
    setDefaultTag: vi.fn(async (t: string | undefined) => {
      db.settings._d.defaultTag = t;
      return "id";
    }),
    getVaultLockAfter: () => db.settings._d.vaultLockAfter,
    setVaultLockAfter: vi.fn(async (ms: number) => {
      db.settings._d.vaultLockAfter = ms;
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
    dayFormat: "long",
    weekFormat: "Mon",
    trashCleanupInterval: 7,
    defaultNotebook: undefined,
    defaultTag: undefined,
    vaultLockAfter: 1000 * 60 * 30,
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
    expect(s.dayFormat).toBe("long");
    expect(s.weekFormat).toBe("Mon");
    expect(s.trashCleanupInterval).toBe(7);
    expect(s.defaultNotebook).toBeUndefined();
    expect(s.defaultTag).toBeUndefined();
    expect(s.vaultLockAfter).toBe(1000 * 60 * 30); // upstream default
    expect(s.profile).toBeUndefined();
    expect(s.themeMode).toBe("dark"); // empty localStorage → default
    expect(s.themeChangeSignal).toBe(0);
    expect(s.transparencyEnabled).toBe(true); // empty localStorage → default
    expect(s.transparencyChangeSignal).toBe(0);
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
    db.settings._d.dayFormat = "short";
    db.settings._d.weekFormat = "Sun";
    db.settings._d.trashCleanupInterval = 30;
    db.settings._d.defaultNotebook = "nb-1";
    db.settings._d.defaultTag = "tag-9";
    db.settings._d.vaultLockAfter = 1000 * 60 * 5;
    db.settings._d.profile = { fullName: "Ada" };
    setActivePinia(createPinia());
    const s = useSettingsStore();
    await s.load();
    expect(s.dateFormat).toBe("YYYY-MM-DD");
    expect(s.timeFormat).toBe("24-hour");
    expect(s.titleFormat).toBe("T $time$");
    expect(s.dayFormat).toBe("short");
    expect(s.weekFormat).toBe("Sun");
    expect(s.trashCleanupInterval).toBe(30);
    expect(s.defaultNotebook).toBe("nb-1");
    expect(s.defaultTag).toBe("tag-9");
    expect(s.vaultLockAfter).toBe(1000 * 60 * 5);
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

  it("setDayFormat calls db + updates state", async () => {
    const s = useSettingsStore();
    await s.setDayFormat("short");
    expect(db.settings.setDayFormat).toHaveBeenCalledWith("short");
    expect(s.dayFormat).toBe("short");
  });

  it("setWeekFormat calls db + updates state", async () => {
    const s = useSettingsStore();
    await s.setWeekFormat("Sun");
    expect(db.settings.setWeekFormat).toHaveBeenCalledWith("Sun");
    expect(s.weekFormat).toBe("Sun");
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

  it("setDefaultTag + clear (undefined) round-trips", async () => {
    const s = useSettingsStore();
    await s.setDefaultTag("tag-2");
    expect(db.settings.setDefaultTag).toHaveBeenCalledWith("tag-2");
    expect(s.defaultTag).toBe("tag-2");
    await s.setDefaultTag(undefined);
    expect(db.settings.setDefaultTag).toHaveBeenCalledWith(undefined);
    expect(s.defaultTag).toBeUndefined();
  });

  it("setVaultLockAfter calls db + updates state (synced ms value)", async () => {
    const s = useSettingsStore();
    await s.setVaultLockAfter(-1); // Never
    expect(db.settings.setVaultLockAfter).toHaveBeenCalledWith(-1);
    expect(s.vaultLockAfter).toBe(-1);
    await s.setVaultLockAfter(1000 * 60 * 60); // 1 hour
    expect(db.settings.setVaultLockAfter).toHaveBeenCalledWith(1000 * 60 * 60);
    expect(s.vaultLockAfter).toBe(1000 * 60 * 60);
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

  it("transparencyEnabled is read from localStorage at construction", () => {
    storage.setItem("notesnook.transparencyEnabled", "false");
    setActivePinia(createPinia());
    const s = useSettingsStore();
    expect(s.transparencyEnabled).toBe(false);
  });

  it("invalid localStorage transparencyEnabled falls back to default (true)", () => {
    storage.setItem("notesnook.transparencyEnabled", "maybe");
    setActivePinia(createPinia());
    const s = useSettingsStore();
    expect(s.transparencyEnabled).toBe(true);
  });

  it("setTransparencyEnabled updates state + persists + bumps the signal", () => {
    const s = useSettingsStore();
    expect(s.transparencyEnabled).toBe(true);
    s.setTransparencyEnabled(false);
    expect(s.transparencyEnabled).toBe(false);
    expect(s.transparencyChangeSignal).toBe(1);
    expect(storage.getItem("notesnook.transparencyEnabled")).toBe("false");
    s.setTransparencyEnabled(true);
    expect(s.transparencyChangeSignal).toBe(2);
    expect(storage.getItem("notesnook.transparencyEnabled")).toBe("true");
  });

  it("darkTheme/lightTheme default to the vendored built-ins", () => {
    const s = useSettingsStore();
    expect(s.darkTheme.id).toBe("default-dark");
    expect(s.lightTheme.id).toBe("default-light");
  });

  it("a stored theme is read back into the slot at construction", () => {
    const custom = { ...ThemeDark, id: "custom-dark", name: "Custom" };
    storage.setItem("notesnook.theme.dark", JSON.stringify(custom));
    setActivePinia(createPinia());
    const s = useSettingsStore();
    expect(s.darkTheme.id).toBe("custom-dark");
  });

  it("setActiveTheme swaps the matching slot, persists + bumps (mode unchanged)", () => {
    const s = useSettingsStore();
    s.setThemeMode("light"); // start from light mode
    const customDark = { ...ThemeDark, id: "custom-dark", name: "Custom Dark" };
    s.setActiveTheme(customDark);
    expect(s.darkTheme.id).toBe("custom-dark");
    expect(s.themeMode).toBe("light"); // installing a dark theme does NOT change the mode
    expect(s.themeChangeSignal).toBe(2); // setThemeMode bumped 1, setActiveTheme bumped 2
    expect(JSON.parse(storage.getItem("notesnook.theme.dark")!).id).toBe("custom-dark");
    expect(s.lightTheme.id).toBe("default-light"); // other slot untouched
  });

  it("setActiveTheme on a light theme does not change themeMode", () => {
    const s = useSettingsStore();
    s.setThemeMode("dark");
    const customLight = { ...ThemeLight, id: "custom-light", name: "Custom Light" };
    s.setActiveTheme(customLight);
    expect(s.lightTheme.id).toBe("custom-light");
    expect(s.themeMode).toBe("dark"); // unchanged — installing never flips the mode
    expect(JSON.parse(storage.getItem("notesnook.theme.light")!).id).toBe("custom-light");
  });

  it("restoreStockThemes resets installed slots to built-in defaults, removes stored themes, and bumps signal", () => {
    const s = useSettingsStore();
    const customDark = { ...ThemeDark, id: "custom-dark", name: "Custom Dark" };
    const customLight = { ...ThemeLight, id: "custom-light", name: "Custom Light" };
    s.setActiveTheme(customDark);
    s.setActiveTheme(customLight);
    expect(s.darkTheme.id).toBe("custom-dark");
    expect(s.lightTheme.id).toBe("custom-light");
    expect(storage.getItem("notesnook.theme.dark")).not.toBeNull();
    expect(storage.getItem("notesnook.theme.light")).not.toBeNull();

    const signalBefore = s.themeChangeSignal;
    s.restoreStockThemes();

    expect(s.darkTheme.id).toBe("default-dark");
    expect(s.lightTheme.id).toBe("default-light");
    expect(storage.getItem("notesnook.theme.dark")).toBeNull();
    expect(storage.getItem("notesnook.theme.light")).toBeNull();
    expect(s.themeChangeSignal).toBe(signalBefore + 1);
  });

  it("isThemeApplied reports either slot", () => {
    const s = useSettingsStore();
    expect(s.isThemeApplied("default-dark")).toBe(true);
    expect(s.isThemeApplied("default-light")).toBe(true);
    expect(s.isThemeApplied("nope")).toBe(false);
  });

  it("getTheme returns the slot for a colorScheme", () => {
    const s = useSettingsStore();
    expect(s.getTheme("dark").id).toBe("default-dark");
    expect(s.getTheme("light").id).toBe("default-light");
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