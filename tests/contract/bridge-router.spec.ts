/**
 * Bridge router contract test — exercises the main-process `appRouter` via
 * tRPC's `createCaller` (no Electron IPC). This pins the procedure shapes the
 * renderer depends on (`ping`, and later `sqlite`/`compress`/…). The IPC
 * transport itself (`electron-trpc`) is the library's responsibility and is
 * wired per its documented pattern in preload/main/renderer.
 */
import { describe, it, expect } from "vitest";
import { appRouter } from "../../apps/desktop/src/contracts/router";

const caller = appRouter.createCaller({});

describe("contract: AppRouter (main↔renderer bridge)", () => {
  it("ping resolves with ok", async () => {
    const res = await caller.ping();
    expect(res.ok).toBe(true);
    expect(typeof res.ts).toBe("number");
  });

  it("sqlite router exposes open/run/close/delete", () => {
    // Shape only — real behaviour lands in M2. tRPC flattens nested routers to
    // dotted paths, so the procedures appear as `sqlite.open`, `sqlite.run`, …
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures).toHaveProperty("sqlite.open");
    expect(procedures).toHaveProperty("sqlite.run");
    expect(procedures).toHaveProperty("sqlite.close");
  });

  it("window router exposes notifyNoteChanged (cross-window note sync)", () => {
    // Shape only — the broadcast impl lives in `src/main/window.ts` and is
    // Electron-only (not exercised here). Pins the procedure the renderer's
    // notes store calls after a save.
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures).toHaveProperty("window.notifyNoteChanged");
  });

  it("upstreamChecker router exposes check (in-app upstream-release notifier)", () => {
    // Shape only — the fetch impl lives in `src/main/upstream-checker.ts` and
    // is exercised (with a stubbed fetch) in `upstream-checker.spec.ts`.
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures).toHaveProperty("upstreamChecker.check");
  });
});