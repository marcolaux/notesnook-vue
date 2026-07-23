/**
 * Themes catalog composable — the data layer for `ThemesSection`. Wraps the
 * `themes-api` client with reactive state: a paginated, searchable,
 * colorScheme-filterable grid seeded with the two installed slots then appended
 * with catalog pages (already-applied themes filtered out, mirroring upstream
 * `themes-selector.tsx`). Also exposes the install + file-import actions.
 *
 * Mirrors upstream `apps/web/src/dialogs/settings/components/themes-selector.tsx`
 * (Vue has no `@trpc/react-query`, so pagination is manual cursor-based state).
 */
import { ref, watch } from "vue";
import { useSettingsStore } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import {
  listThemes,
  installTheme,
  updateTheme,
  type ThemeFilter,
  type CatalogResult
} from "@/platform/themes-api";
import {
  getPreviewColors,
  validateTheme,
  type VueTheme,
  type ThemeMetadata,
  type CompiledThemeDefinition,
  type PreviewColors,
  type ThemeDefinition
} from "@notesnook-vue/theme-vue";

/** A unified grid row — installed slots and catalog list items both normalize to this.
 *  Optional catalog fields are declared `T | undefined` (not `?: T`) so the
 *  composable can assign explicit `undefined` under `exactOptionalPropertyTypes`. */
export type ThemeGridItem = {
  id: string;
  name: string;
  colorScheme: "dark" | "light";
  previewColors: PreviewColors;
  totalInstalls: number | undefined;
  sourceURL: string | undefined;
  version: number;
  authors: { name: string; email?: string; url?: string }[];
  description: string;
  homepage: string | undefined;
  license: string;
  isApplied: boolean;
};

/** Installed slots don't carry `previewColors` (the catalog does) — compute it.
 *  Exported so `ThemesSection` can build a grid row for a file-imported theme. */
export function toGridItem(theme: VueTheme | ThemeMetadata, isApplied: boolean): ThemeGridItem {
  const previewColors =
    "previewColors" in theme && theme.previewColors
      ? theme.previewColors
      : getPreviewColors(theme as VueTheme);
  return {
    id: theme.id,
    name: theme.name,
    colorScheme: theme.colorScheme,
    previewColors,
    totalInstalls: "totalInstalls" in theme ? theme.totalInstalls : undefined,
    sourceURL: "sourceURL" in theme ? theme.sourceURL : undefined,
    version: theme.version,
    authors: theme.authors,
    description: theme.description,
    homepage: theme.homepage,
    license: theme.license,
    isApplied
  };
}

export type ColorSchemeFilter = "all" | "dark" | "light";

export function useThemesCatalog() {
  const settings = useSettingsStore();
  const auth = useAuthStore();

  const items = ref<ThemeGridItem[]>([]);
  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref<string | undefined>(undefined);
  const searchQuery = ref("");
  const colorSchemeFilter = ref<ColorSchemeFilter>("all");

  let cursor = 0;
  let hasMore = true;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  function installedItems(): ThemeGridItem[] {
    return [
      toGridItem(settings.darkTheme, true),
      toGridItem(settings.lightTheme, true)
    ];
  }

  function buildFilters(): ThemeFilter[] {
    const f: ThemeFilter[] = [];
    const q = searchQuery.value.trim();
    if (q) f.push({ type: "term", value: q });
    if (colorSchemeFilter.value !== "all")
      f.push({ type: "colorScheme", value: colorSchemeFilter.value });
    return f;
  }

  async function fetchPage(first: boolean): Promise<void> {
    if (first) {
      loading.value = true;
      cursor = 0;
      hasMore = true;
    } else {
      if (!hasMore || loadingMore.value || loading.value) return;
      loadingMore.value = true;
    }
    const res = await listThemes({ cursor, limit: 10, filters: buildFilters() });
    if (res.ok) {
      const applied = new Set([settings.darkTheme.id, settings.lightTheme.id]);
      const catalog = res.data.themes
        .filter((t) => !applied.has(t.id))
        .map((t) => toGridItem(t, false));
      // Re-seed the installed slots each page (they may have changed via install
      // in another window) — keeps the "active" badges accurate.
      if (first) items.value = [...installedItems(), ...catalog];
      else items.value = [...items.value, ...catalog];
      cursor = res.data.nextCursor ?? cursor;
      hasMore = res.data.nextCursor !== undefined;
      error.value = undefined;
    } else {
      error.value = res.error;
      if (first) items.value = installedItems(); // still show the two installed themes
    }
    if (first) loading.value = false;
    else loadingMore.value = false;
  }

  function refresh(): void {
    void fetchPage(true);
  }
  function loadMore(): void {
    void fetchPage(false);
  }

  // Debounced search (500ms, like upstream) + immediate filter change → refresh.
  watch(searchQuery, () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(refresh, 500);
  });
  watch(colorSchemeFilter, refresh);

  /** Install a catalog theme by id into its colorScheme slot (makes it active).
   *  Returns the never-throw envelope; on success the slot is applied + refreshed. */
  async function install(
    item: ThemeGridItem
  ): Promise<CatalogResult<CompiledThemeDefinition | undefined>> {
    const res = await installTheme(item.id, auth.user?.id);
    if (res.ok && res.data) {
      settings.setActiveTheme(res.data);
      refresh();
    }
    return res;
  }

  /** Validate a file-imported theme JSON (no server round-trip). */
  function validateImport(
    json: unknown
  ): { ok: true; theme: VueTheme } | { ok: false; error: string } {
    const result = validateTheme(json as Partial<ThemeDefinition>);
    if (result.error) return { ok: false, error: result.error };
    return { ok: true, theme: json as VueTheme };
  }

  /** Apply an already-validated imported theme directly (no server round-trip). */
  function applyImported(theme: VueTheme): void {
    settings.setActiveTheme(theme);
    refresh();
  }

  /** Restore stock built-in themes (resets installed slots and refreshes catalog state). */
  function restoreStockThemes(): void {
    settings.restoreStockThemes();
    refresh();
  }

  function isApplied(id: string): boolean {
    return settings.isThemeApplied(id);
  }

  // Initial load on creation (ThemesSection mounts on demand).
  refresh();

  return {
    items,
    loading,
    loadingMore,
    error,
    searchQuery,
    colorSchemeFilter,
    refresh,
    loadMore,
    install,
    validateImport,
    applyImported,
    restoreStockThemes,
    isApplied
  };
}

/** Built-in theme ids — skipped by the boot auto-update (they're not in the catalog). */
const BUILT_IN_IDS = new Set(["default-dark", "default-light"]);

/**
 * Best-effort boot auto-update: for each installed slot that came from the
 * catalog (not a built-in), ask the server for a newer version and silently
 * upgrade the slot (without flipping the active mode). Errors are swallowed —
 * this never blocks boot or surfaces to the user. Mirrors upstream
 * `themeStore.init()` → `updateTheme`.
 */
export async function autoUpdateInstalledThemes(): Promise<void> {
  try {
    const settings = useSettingsStore();
    for (const slot of ["dark", "light"] as const) {
      const theme = settings.getTheme(slot);
      if (BUILT_IN_IDS.has(theme.id)) continue;
      const res = await updateTheme(theme.id, theme.version);
      if (res.ok && res.data) settings.setActiveTheme(res.data);
    }
  } catch {
    /* best-effort — never throw on boot */
  }
}