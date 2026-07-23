/**
 * Re-declared shape of the upstream themes-server tRPC router
 * (`@notesnook/themes-server`, which is `private: true` — not on npm — so its
 * types can't be imported). We reconstruct the router TYPE here (input zod
 * schemas + output types) so `createTRPCProxyClient<ThemesRouter>` is fully
 * typed when calling `https://themes-api.notesnook.com`.
 *
 * The server uses `initTRPC.create()` with **no transformer**, so the client's
 * `httpBatchLink({ url })` (also no transformer) matches the wire format exactly.
 *
 * This lives in the renderer tree (not `contracts/`) because the main process
 * never builds this router — it's a client-only re-type. `themesRouter` is a
 * runtime value built with `@trpc/server`, but it is NEVER imported at runtime —
 * `themes-api.ts` does `import type { ThemesRouter }`, which erases the import
 * and keeps `@trpc/server` out of the renderer bundle (only the type is used).
 * The resolver bodies are dummies whose annotated return types become the
 * procedure output types.
 *
 * Procedures (all `query`, mirroring `servers/themes/src/api.ts`):
 *  - `themes`        → `{ themes: ThemeMetadata[]; nextCursor: number|undefined }`
 *  - `installTheme`  → full `CompiledThemeDefinition | undefined`
 *  - `updateTheme`   → newer `CompiledThemeDefinition | undefined` (only if server version differs)
 *  - `sync`, `health` → maintenance (unused here)
 */
import { initTRPC } from "@trpc/server";
import { z } from "zod";
import type { ThemeMetadata, CompiledThemeDefinition } from "@notesnook-vue/theme-vue";

const t = initTRPC.create();

const ThemeQuerySchema = z.object({
  filters: z
    .array(z.object({ type: z.enum(["term", "colorScheme"]), value: z.string() }))
    .optional(),
  limit: z.number(),
  cursor: z.number().default(0),
  compatibilityVersion: z.number().default(1)
});

const InstallThemeSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  compatibilityVersion: z.number().default(1)
});

const UpdateThemeSchema = z.object({
  id: z.string(),
  version: z.number(),
  compatibilityVersion: z.number()
});

type ThemesPage = { themes: ThemeMetadata[]; nextCursor?: number };

// Dummy resolvers — only the TYPE is consumed via `import type { ThemesRouter }`.
export const themesRouter = t.router({
  themes: t.procedure.input(ThemeQuerySchema).query((): ThemesPage => ({ themes: [] })),
  installTheme: t.procedure
    .input(InstallThemeSchema)
    .query((): CompiledThemeDefinition | undefined => undefined),
  updateTheme: t.procedure
    .input(UpdateThemeSchema)
    .query((): CompiledThemeDefinition | undefined => undefined),
  sync: t.procedure.query(() => true),
  health: t.procedure.query(() => "Healthy" as const)
});

export type ThemesRouter = typeof themesRouter;