// @vitest-environment node
/**
 * Themes catalog composable tests — covers the `useThemesCatalog` data layer
 * (pagination state machine, install → slot swap, file-import validation) with
 * the `themes-api` network module mocked, so no HTTP is made. The two-slot
 * store behavior itself is covered in `settings.spec.ts`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// --- Mocks (hoisted) --------------------------------------------------------
const { listThemesMock, installThemeMock, updateThemeMock } = vi.hoisted(() => ({
  listThemesMock: vi.fn(),
  installThemeMock: vi.fn(),
  updateThemeMock: vi.fn()
}));

vi.mock("@/platform/themes-api", () => ({
  THEMES_SERVER_URL: "https://themes-api.notesnook.com",
  listThemes: listThemesMock,
  installTheme: installThemeMock,
  updateTheme: updateThemeMock
}));
vi.mock("@/platform/bootstrap", () => ({ getCurrentContext: () => "local", getDatabase: () => ({ settings: {} }) }));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ user: { value: undefined } })
}));

import { useThemesCatalog, toGridItem } from "@/composables/use-themes-catalog";
import { useSettingsStore } from "@/stores/settings";
import { ThemeDark, type ThemeMetadata } from "@notesnook-vue/theme-vue";

/** Build a catalog list item (ThemeMetadata shape) with a unique id. */
function meta(id: string, colorScheme: "dark" | "light"): ThemeMetadata {
  return {
    ...ThemeDark,
    id,
    name: id,
    colorScheme,
    previewColors: {
      editor: "#000",
      accentForeground: "#fff",
      navigationMenu: { shade: "#000", accent: "#000", background: "#000", icon: "#fff" },
      list: { heading: "#fff", accent: "#000", accentForeground: "#fff", background: "#000" },
      statusBar: { paragraph: "#fff", background: "#000", icon: "#fff" },
      border: "#000",
      paragraph: "#fff",
      background: "#000",
      accent: "#000"
    }
  } as unknown as ThemeMetadata;
}

/** Flush pending microtasks (the composable's `refresh()` is async). */
function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  setActivePinia(createPinia());
  listThemesMock.mockReset();
  installThemeMock.mockReset();
  updateThemeMock.mockReset();
  // Default: empty catalog so the initial `refresh()` resolves cleanly.
  listThemesMock.mockResolvedValue({ ok: true, data: { themes: [], nextCursor: undefined } });
});

describe("toGridItem", () => {
  it("computes previewColors for a theme that doesn't carry them", () => {
    const item = toGridItem(ThemeDark, true);
    expect(item.id).toBe("default-dark");
    expect(item.isApplied).toBe(true);
    expect(item.previewColors).toBeDefined();
    expect(item.previewColors.accent).toBe(ThemeDark.scopes.base.primary.accent);
  });

  it("uses the server-provided previewColors when present", () => {
    const m = meta("cat-1", "dark");
    const item = toGridItem(m, false);
    expect(item.previewColors.accent).toBe("#000"); // from the mocked previewColors
  });
});

describe("useThemesCatalog — validateImport", () => {
  it("accepts a valid theme definition", () => {
    const c = useThemesCatalog();
    const res = c.validateImport(ThemeDark);
    expect(res.ok).toBe(true);
  });

  it("rejects a malformed theme (missing required fields)", () => {
    const c = useThemesCatalog();
    const res = c.validateImport({});
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBeTruthy();
  });
});

describe("useThemesCatalog — pagination + install", () => {
  it("seeds the grid with the 2 installed slots then the first page", async () => {
    listThemesMock.mockReset();
    listThemesMock.mockResolvedValueOnce({
      ok: true,
      data: { themes: [meta("cat-1", "dark")], nextCursor: 2 }
    });
    const c = useThemesCatalog();
    await vi.waitFor(() => expect(c.items.value.length).toBe(3)); // 2 installed + 1
    expect(c.items.value[0].id).toBe("default-dark");
    expect(c.items.value[2].id).toBe("cat-1");
  });

  it("loadMore appends the next page and stops when nextCursor is undefined", async () => {
    listThemesMock.mockReset();
    listThemesMock.mockResolvedValueOnce({
      ok: true,
      data: { themes: [meta("cat-1", "dark")], nextCursor: 2 }
    });
    listThemesMock.mockResolvedValueOnce({
      ok: true,
      data: { themes: [meta("cat-2", "dark")], nextCursor: undefined }
    });
    const c = useThemesCatalog();
    await vi.waitFor(() => expect(c.items.value.length).toBe(3));
    c.loadMore();
    await vi.waitFor(() => expect(c.items.value.length).toBe(4));
    // No more pages — a second loadMore must not call listThemes again.
    const calls = listThemesMock.mock.calls.length;
    c.loadMore();
    await flush();
    expect(listThemesMock.mock.calls.length).toBe(calls);
  });

  it("install fetches the full theme and applies it to its slot (mode unchanged)", async () => {
    const c = useThemesCatalog();
    await vi.waitFor(() => expect(c.items.value.length).toBe(2));
    const s = useSettingsStore();
    s.setThemeMode("light"); // start in light mode
    const full = { ...ThemeDark, id: "custom-dark", name: "Custom Dark" };
    installThemeMock.mockResolvedValueOnce({ ok: true, data: full });
    const item = toGridItem(meta("custom-dark", "dark"), false);
    const res = await c.install(item);
    expect(res.ok).toBe(true);
    expect(s.darkTheme.id).toBe("custom-dark");
    expect(s.themeMode).toBe("light"); // installing a dark theme does NOT flip the mode
  });

  it("surfaces an install failure as ok:false (never throws)", async () => {
    const c = useThemesCatalog();
    await vi.waitFor(() => expect(c.items.value.length).toBe(2));
    installThemeMock.mockResolvedValueOnce({ ok: false, error: "boom" });
    const res = await c.install(toGridItem(meta("x", "dark"), false));
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe("boom");
  });

  it("restoreStockThemes resets installed slots and refreshes catalog grid", async () => {
    const c = useThemesCatalog();
    await vi.waitFor(() => expect(c.items.value.length).toBe(2));
    const s = useSettingsStore();
    const full = { ...ThemeDark, id: "custom-dark", name: "Custom Dark" };
    installThemeMock.mockResolvedValueOnce({ ok: true, data: full });
    await c.install(toGridItem(meta("custom-dark", "dark"), false));
    expect(s.darkTheme.id).toBe("custom-dark");
    expect(c.items.value[0].id).toBe("custom-dark");

    c.restoreStockThemes();
    await vi.waitFor(() => expect(c.items.value[0].id).toBe("default-dark"));
    expect(s.darkTheme.id).toBe("default-dark");
    expect(s.lightTheme.id).toBe("default-light");
  });
});