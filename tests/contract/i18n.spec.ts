// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import i18n, { setLocale, syncLocale, LOCALE_STORAGE_KEY, LOCALES, PSEUDO_LOCALE, toPseudo } from "@/i18n";
import { translate, type Messages } from "@contracts/i18n";
import en from "@contracts/i18n/en";
import de from "@contracts/i18n/de";
import { appStateSetInput } from "@contracts/router";

// `@/i18n` reads the per-account locale via `getCurrentContext()` from
// bootstrap; mock it so the real (heavy) bootstrap module graph never loads in
// the headless test env. The current context is fixed to "local" so the
// per-account key is `notesnook.locale.local`.
vi.mock("@/platform/bootstrap", () => ({ getCurrentContext: () => "local" }));

// ---------------------------------------------------------------------------
// Catalog (pure)
// ---------------------------------------------------------------------------

describe("toPseudo (pure)", () => {
  it("wraps every string leaf in guillemets, preserving structure", () => {
    const out = toPseudo({ a: "hi", nested: { b: "deep" }, list: ["x", "y"] });
    expect(out).toEqual({
      a: "⟪hi⟫",
      nested: { b: "⟪deep⟫" },
      list: ["⟪x⟫", "⟪y⟫"]
    });
  });

  it("leaves non-string leaves untouched", () => {
    expect(toPseudo(42 as unknown as string)).toBe(42);
    expect(toPseudo(null as unknown as string)).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// Locale constants
// ---------------------------------------------------------------------------

describe("locale constants", () => {
  it("ships en + de + pseudo", () => {
    expect(LOCALES).toEqual(["en", "de", "pseudo"]);
    expect(PSEUDO_LOCALE).toBe("pseudo");
  });
});

// ---------------------------------------------------------------------------
// Map-backed localStorage (node has none). Scoped to this file.
// ---------------------------------------------------------------------------
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

beforeEach(() => {
  storage = new MemStorage();
  (globalThis as { localStorage?: MemStorage }).localStorage = storage;
});

// ---------------------------------------------------------------------------
// Instance + setLocale
// ---------------------------------------------------------------------------

describe("i18n instance", () => {
  it("defaults to en when no locale is persisted", () => {
    expect(i18n.global.locale.value).toBe("en");
  });

  it("resolves English catalog keys", () => {
    expect(i18n.global.t("sidebar.notebooks")).toBe("Notebooks");
    expect(i18n.global.t("sidebar.tags")).toBe("Tags");
    expect(i18n.global.t("sidebar.noNotebooks")).toBe("No notebooks");
    expect(i18n.global.t("sidebar.noTags")).toBe("No tags");
    expect(i18n.global.t("common.greeting")).toBe("Notesnook Vue");
  });

  it("pseudo locale wraps every value (full catalog, no fallback needed)", () => {
    setLocale("pseudo");
    expect(i18n.global.locale.value).toBe("pseudo");
    expect(i18n.global.t("sidebar.notebooks")).toBe("⟪Notebooks⟫");
    expect(i18n.global.t("common.greeting")).toBe("⟪Notesnook Vue⟫");
  });

  it("falls back to en for a locale with no messages (e.g. an unloaded 'fr')", () => {
    // 'fr' is not in the messages map → vue-i18n falls back to fallbackLocale 'en'.
    i18n.global.locale.value = "fr";
    expect(i18n.global.t("sidebar.notebooks")).toBe("Notebooks");
  });

  it("falls back to en for a missing key", () => {
    setLocale("en");
    // A key absent from the catalog resolves to its key path (vue-i18n default)
    // rather than throwing — translation is total-safe.
    expect(i18n.global.t("sidebar.doesNotExist")).toBe("sidebar.doesNotExist");
  });

  it("resolves the Batch 6 command/contextMenu/status/updater keys", () => {
    expect(i18n.global.t("command.newNote")).toBe("New note");
    expect(i18n.global.t("command.openSettings")).toBe("Open Settings");
    expect(i18n.global.t("command.goTo", { label: "Archive" })).toBe("Go to Archive");
    expect(i18n.global.t("command.newNoteFrom", { title: "Daily" })).toBe("New note from Daily");
    expect(i18n.global.t("contextMenu.moveToTrashSingle")).toBe(
      "Move this note to trash? You can restore it from the trash later."
    );
    expect(i18n.global.t("contextMenu.unpublishNote")).toBe("Unpublish note");
    expect(i18n.global.t("contextMenu.color")).toBe("Color");
    expect(i18n.global.t("status.localOnly")).toBe("Local only");
    expect(i18n.global.t("status.minutesAgo", { n: 5 })).toBe("5m ago");
    expect(i18n.global.t("status.relativeUnsynced", { relative: "5m ago" })).toBe(
      "5m ago • unsynced"
    );
    expect(i18n.global.t("updater.updateAvailableVersion", { version: "1.2.3" })).toBe(
      "Update available (v1.2.3)"
    );
    expect(i18n.global.t("updater.downloading", { progress: 42 })).toBe("Downloading… (42%)");
    // `te` gates the omnibar command-title resolver: key strings return true,
    // already-resolved snapshots (e.g. "Go to Archive") return false.
    expect(i18n.global.te("command.newNote")).toBe(true);
    expect(i18n.global.te("Go to Archive")).toBe(false);
  });

  it("resolves the contextMenu.moveToTrashConfirm plural via the `|` string + count", () => {
    // vue-i18n v11: array plural messages are a NOOP in composition `t`; the
    // `|`-separated string is the supported plural form. `{n}` auto-binds to
    // the count passed as the 2nd arg.
    expect(i18n.global.t("contextMenu.moveToTrashConfirm", 1)).toBe(
      "Move 1 note to trash? You can restore them from the trash later."
    );
    expect(i18n.global.t("contextMenu.moveToTrashConfirm", 3)).toBe(
      "Move 3 notes to trash? You can restore them from the trash later."
    );
  });
});

describe("setLocale", () => {
  it("switches the active locale", () => {
    setLocale("pseudo");
    expect(i18n.global.locale.value).toBe("pseudo");
    setLocale("en");
    expect(i18n.global.locale.value).toBe("en");
  });

  it("persists the choice to the per-account localStorage key", () => {
    setLocale("pseudo");
    expect(storage.getItem("notesnook.locale.local")).toBe("pseudo");
    setLocale("en");
    expect(storage.getItem("notesnook.locale.local")).toBe("en");
  });

  it("does not throw when localStorage is unavailable", () => {
    delete (globalThis as { localStorage?: MemStorage }).localStorage;
    expect(() => setLocale("pseudo")).not.toThrow();
    // The locale still switches in-memory.
    expect(i18n.global.locale.value).toBe("pseudo");
  });
});

// ---------------------------------------------------------------------------
// syncLocale (cross-window mirror — applies a locale change that originated
// in ANOTHER window, without re-persisting or re-notifying main)
// ---------------------------------------------------------------------------

describe("syncLocale (cross-window mirror)", () => {
  it("exposes the localStorage key the storage listener watches", () => {
    expect(LOCALE_STORAGE_KEY).toBe("notesnook.locale");
  });

  it("switches this window's vue-i18n ref to a known locale", () => {
    setLocale("en");
    syncLocale("de", "local");
    expect(i18n.global.locale.value).toBe("de");
    syncLocale("pseudo", "local");
    expect(i18n.global.locale.value).toBe("pseudo");
    setLocale("en");
  });

  it("does NOT persist to localStorage (the originator already did)", () => {
    // `storage` (the beforeEach fixture) IS globalThis.localStorage here.
    storage.setItem("notesnook.locale", "en");
    syncLocale("de", "local");
    expect(i18n.global.locale.value).toBe("de");
    expect(storage.getItem("notesnook.locale")).toBe("en");
    setLocale("en");
  });

  it("ignores an unknown locale (no-op)", () => {
    setLocale("en");
    syncLocale("fr", "local");
    expect(i18n.global.locale.value).toBe("en");
  });

  it("ignores null (key cleared in another window)", () => {
    setLocale("en");
    syncLocale(null, "local");
    expect(i18n.global.locale.value).toBe("en");
  });

  it("applies a legacy (null-ctx) write to the current context", () => {
    setLocale("en");
    syncLocale("de", null);
    expect(i18n.global.locale.value).toBe("de");
    setLocale("en");
  });

  it("is ignored when ctx is a different account", () => {
    setLocale("en");
    syncLocale("de", "a1b2c3d4e5f60718");
    expect(i18n.global.locale.value).toBe("en"); // unchanged — not this window's account
  });
});

// ---------------------------------------------------------------------------
// Initial-locale read at construction (re-import with a pre-set localStorage)
// ---------------------------------------------------------------------------

describe("initial locale read from localStorage", () => {
  async function freshI18n(persisted: string | null): Promise<typeof i18n> {
    vi.resetModules();
    const fresh = new MemStorage();
    if (persisted !== null) fresh.setItem("notesnook.locale", persisted);
    (globalThis as { localStorage?: MemStorage }).localStorage = fresh;
    const mod = await import("@/i18n");
    return mod.default;
  }

  it("reads 'pseudo' when it is persisted", async () => {
    const fresh = await freshI18n("pseudo");
    expect(fresh.global.locale.value).toBe("pseudo");
  });

  it("defaults to 'en' when nothing is persisted", async () => {
    const fresh = await freshI18n(null);
    expect(fresh.global.locale.value).toBe("en");
  });

  it("defaults to 'en' for an invalid persisted value", async () => {
    const fresh = await freshI18n("klingon");
    expect(fresh.global.locale.value).toBe("en");
  });
});

// ---------------------------------------------------------------------------
// Component integration — `useI18n()` + `$t` renders + reacts to setLocale
// ---------------------------------------------------------------------------

describe("component integration", () => {
  const Greeting = defineComponent({
    setup() {
      const { t } = useI18n();
      return { t };
    },
    template: `<p>{{ t("common.greeting") }}</p>`
  });

  beforeEach(() => setLocale("en"));

  it("renders the English value via useI18n().t", () => {
    const wrapper = mount(Greeting, { global: { plugins: [i18n] } });
    expect(wrapper.text()).toBe("Notesnook Vue");
  });

  it("reacts to setLocale (pseudo wraps)", async () => {
    const wrapper = mount(Greeting, { global: { plugins: [i18n] } });
    expect(wrapper.text()).toBe("Notesnook Vue");
    setLocale("pseudo");
    await nextTick();
    expect(wrapper.text()).toBe("⟪Notesnook Vue⟫");
    setLocale("en");
    await nextTick();
    expect(wrapper.text()).toBe("Notesnook Vue");
  });
});
// ---------------------------------------------------------------------------
// Phase 7.2 — shared translator (main-process path) + German catalog
// ---------------------------------------------------------------------------

/** Flatten a nested catalog to `dotted.key → leaf` for completeness checks. */
function flatten(obj: unknown, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flatten(v, key));
      else out[key] = v;
    }
  }
  return out;
}

describe("translate (shared, main-process path)", () => {
  const messages: Partial<Record<string, Messages>> = { en, de, pseudo: toPseudo(en) };

  it("resolves an English main-process key", () => {
    expect(translate(messages, "en", "menu.file")).toBe("File");
  });

  it("resolves a German main-process key", () => {
    expect(translate(messages, "de", "menu.file")).toBe("Datei");
    expect(translate(messages, "de", "tray.quit")).toBe("Beenden");
    expect(translate(messages, "de", "window.whatsNew")).toBe("Was ist neu");
    expect(translate(messages, "de", "dialog.notesnookBackup")).toBe("Notesnook-Backup");
  });

  it("interpolates {param}", () => {
    expect(translate(messages, "de", "titlebar.version", { version: "1.2.3" })).toBe("v1.2.3");
  });

  it("selects the `|`-plural form by a numeric n", () => {
    expect(translate(messages, "de", "contextMenu.moveToTrashConfirm", { n: 1 })).toContain(
      "1 Notiz in den Papierkorb"
    );
    expect(translate(messages, "de", "contextMenu.moveToTrashConfirm", { n: 3 })).toContain(
      "3 Notizen in den Papierkorb"
    );
  });

  it("falls back to en for a missing key in the active locale", () => {
    // 'de' has no 'sidebar.notebooks'-style gap by construction, but a synthetic
    // sparse locale proves the fallback path.
    const sparse: Partial<Record<string, Messages>> = { en, de: {} as Messages };
    expect(translate(sparse, "de", "menu.file")).toBe("File");
  });

  it("returns the key path when nothing resolves (visible miss)", () => {
    expect(translate(messages, "de", "menu.doesNotExist")).toBe("menu.doesNotExist");
  });
});

describe("German catalog (de)", () => {
  it("is a full translation — every en key is present in de", () => {
    const enKeys = Object.keys(flatten(en));
    const deKeys = Object.keys(flatten(de));
    const missing = enKeys.filter((k) => !deKeys.includes(k));
    expect(missing).toEqual([]);
  });

  it("weekdays array translates to German abbreviations", () => {
    expect(de.reminder.weekdays).toEqual(["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]);
  });

  it("resolves a German key through vue-i18n", () => {
    i18n.global.locale.value = "de";
    expect(i18n.global.t("menu.file")).toBe("Datei");
    expect(i18n.global.t("command.newNote")).toBe("Neue Notiz");
    expect(i18n.global.t("command.goTo", { label: "Archiv" })).toBe("Zu Archiv");
    setLocale("en");
  });
});

describe("appState.set input (zod)", () => {
  it("accepts { locale: 'de' }", () => {
    expect(appStateSetInput.parse({ locale: "de" })).toEqual({ locale: "de" });
    expect(appStateSetInput.parse({ skippedLogin: true, locale: "pseudo" })).toEqual({
      skippedLogin: true,
      locale: "pseudo"
    });
  });

  it("rejects an unknown locale", () => {
    expect(() => appStateSetInput.parse({ locale: "fr" })).toThrow();
  });
});
