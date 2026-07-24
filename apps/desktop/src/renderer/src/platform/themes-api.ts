/**
 * Themes catalog client — a typed tRPC client against the upstream themes
 * server (`https://themes-api.notesnook.com`). Mirrors the upstream web's
 * `apps/web/src/common/themes-router.ts` (`createTRPCProxyClient` + `httpBatchLink`).
 *
 * `@trpc/client` is already a renderer dep (the IPC bridge uses it), and the
 * themes server uses `initTRPC.create()` with no transformer, so the
 * no-transformer `httpBatchLink` matches the wire format exactly.
 *
 * Every call returns a never-throw `CatalogResult` envelope (mirrors the
 * `upstream-checker.ts` pattern) so the UI never has to try/catch network
 * failures — they surface as `{ ok: false, error }`.
 */
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { ThemesRouter } from "./themes-router";
import {
  THEME_COMPATIBILITY_VERSION,
  type ThemeMetadata,
  type CompiledThemeDefinition
} from "@notesnook-vue/theme-vue";

export const THEMES_SERVER_URL = "https://themes-api.notesnook.com";

const client = createTRPCProxyClient<ThemesRouter>({
  links: [httpBatchLink({ url: THEMES_SERVER_URL })]
});

export type ThemeFilter = { type: "term" | "colorScheme"; value: string };
export type ThemesPage = { themes: ThemeMetadata[]; nextCursor?: number };

export type CatalogResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ok = <T>(data: T): CatalogResult<T> => ({ ok: true, data });
const fail = (error: string): CatalogResult<never> => ({ ok: false, error });
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Fetch one page of the catalog (sorted by `totalInstalls DESC` server-side).
 * `cursor` is a numeric offset (`cursor + limit` when more results remain);
 * pass `filters` for full-text `term` search and/or `colorScheme` equality.
 */
export async function listThemes(args: {
  cursor?: number | undefined;
  limit?: number | undefined;
  filters?: ThemeFilter[] | undefined;
}): Promise<CatalogResult<ThemesPage>> {
  try {
    const payload: {
      limit: number;
      cursor?: number;
      compatibilityVersion?: number;
      filters?: ThemeFilter[];
    } = {
      limit: args.limit ?? 10,
      compatibilityVersion: THEME_COMPATIBILITY_VERSION
    };
    if (typeof args.cursor === "number" && args.cursor > 0) {
      payload.cursor = args.cursor;
    }
    if (args.filters && args.filters.length > 0) {
      payload.filters = args.filters;
    }
    const data = await client.themes.query(payload);
    return ok(data);
  } catch (e) {
    return fail(`Failed to load themes: ${message(e)}`);
  }
}

/**
 * Install a theme — returns the full `CompiledThemeDefinition` (incl. `scopes`
 * + `codeBlockCSS` + `previewColors`), which the catalog list item omits. Pass
 * `userId` only when logged in (it increments the server's install counter).
 */
export async function installTheme(
  id: string,
  userId?: string | undefined
): Promise<CatalogResult<CompiledThemeDefinition | undefined>> {
  try {
    const payload: {
      id: string;
      userId?: string;
      compatibilityVersion: number;
    } = {
      id,
      compatibilityVersion: THEME_COMPATIBILITY_VERSION
    };
    if (userId && userId.trim()) {
      payload.userId = userId.trim();
    }
    const data = await client.installTheme.query(payload);
    return ok(data);
  } catch (e) {
    return fail(`Failed to install theme: ${message(e)}`);
  }
}

/**
 * Check whether the server has a newer version of an installed theme. Returns
 * the updated theme only when the server's `version` differs from the passed
 * `version`; otherwise `undefined`. Used on boot to auto-update both slots
 * (errors swallowed, like upstream `updateTheme`).
 */
export async function updateTheme(
  id: string,
  version: number
): Promise<CatalogResult<CompiledThemeDefinition | undefined>> {
  try {
    const data = await client.updateTheme.query({
      id,
      version,
      compatibilityVersion: THEME_COMPATIBILITY_VERSION
    });
    return ok(data);
  } catch (e) {
    return fail(`Failed to check for theme updates: ${message(e)}`);
  }
}