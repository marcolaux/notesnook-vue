/**
 * Contract for the Electron main <-> renderer tRPC router.
 *
 * We mirror the upstream `apps/desktop` AppRouter shape procedure-by-procedure
 * so the renderer can later swap in `electron-trpc` without changing call
 * sites. For now this is a placeholder — add procedures here as features land
 * (window.open, sqlite.run, updater.check, etc.).
 *
 * The type-only import of the upstream AppRouter is optional and only used
 * when @notesnook/desktop becomes available as a published package. Until then
 * this file is the single source of truth for the router contract.
 */
import { initTRPC } from "@trpc/server";
import { z } from "zod";

const t = initTRPC.create();

export const appRouter = t.router({
  // Window management — matches upstream apps/desktop/src/api/window.ts
  window: t.router({
    open: t.procedure
      .input(
        z.object({
          url: z.string().url().optional(),
          singleNote: z.boolean().optional(),
          noteId: z.string().optional()
        })
      )
      .mutation(() => ({ ok: true as const })),
    maximize: t.procedure.mutation(() => ({ ok: true as const })),
    restore: t.procedure.mutation(() => ({ ok: true as const })),
    minimize: t.procedure.mutation(() => ({ ok: true as const })),
    fullscreen: t.procedure.query(() => false),
    list: t.procedure.query(() => [] as Array<{ id: number; title: string }>)
  }),

  // SQLite — matches upstream apps/desktop/src/api/sqlite-kysely.ts
  sqlite: t.router({
    open: t.procedure.input(z.object({ path: z.string(), password: z.string() })).mutation(() => ({ ok: true as const })),
    run: t.procedure.input(z.object({ sql: z.string(), params: z.array(z.unknown()).optional() })).mutation(() => ({ rows: [] as unknown[] })),
    close: t.procedure.mutation(() => ({ ok: true as const }))
  }),

  // Updater — matches upstream apps/desktop/src/api/updater.ts
  updater: t.router({
    check: t.procedure.query(() => ({ available: false, version: null as string | null })),
    download: t.procedure.mutation(() => ({ ok: true as const })),
    install: t.procedure.mutation(() => ({ ok: true as const }))
  })
});

export type AppRouter = typeof appRouter;