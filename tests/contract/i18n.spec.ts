// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import i18n, { setLocale, LOCALES, PSEUDO_LOCALE, toPseudo } from "@/i18n";

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
  it("ships en + pseudo", () => {
    expect(LOCALES).toEqual(["en", "pseudo"]);
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
});

describe("setLocale", () => {
  it("switches the active locale", () => {
    setLocale("pseudo");
    expect(i18n.global.locale.value).toBe("pseudo");
    setLocale("en");
    expect(i18n.global.locale.value).toBe("en");
  });

  it("persists the choice to localStorage", () => {
    setLocale("pseudo");
    expect(storage.getItem("notesnook.locale")).toBe("pseudo");
    setLocale("en");
    expect(storage.getItem("notesnook.locale")).toBe("en");
  });

  it("does not throw when localStorage is unavailable", () => {
    delete (globalThis as { localStorage?: MemStorage }).localStorage;
    expect(() => setLocale("pseudo")).not.toThrow();
    // The locale still switches in-memory.
    expect(i18n.global.locale.value).toBe("pseudo");
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