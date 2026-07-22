import { describe, it, expect } from "vitest";
import { shouldRunAutoSync, type AutoSyncGating } from "../../apps/desktop/src/contracts/auto-sync-gating";

const MAIN: AutoSyncGating = { isLoggedIn: true, syncEnabled: true, windowType: null };

describe("auto-sync-gating — shouldRunAutoSync", () => {
  it("reacts to a server-initiated trigger (first arg true)", () => {
    expect(shouldRunAutoSync([true, false], MAIN)).toBe(true);
  });

  it("reacts to onPushCompleted (true, false, deviceId)", () => {
    expect(shouldRunAutoSync([true, false, "device-1"], MAIN)).toBe(true);
  });

  it("ignores local-edit AutoSync publishes (first arg false)", () => {
    expect(shouldRunAutoSync([false, false], MAIN)).toBe(false);
  });

  it("ignores publishes with no args", () => {
    expect(shouldRunAutoSync([], MAIN)).toBe(false);
  });

  it("does not require a sync when logged out (local mode)", () => {
    expect(
      shouldRunAutoSync([true, false], { ...MAIN, isLoggedIn: false })
    ).toBe(false);
  });

  it("does not sync when sync is disabled in config", () => {
    expect(
      shouldRunAutoSync([true, false], { ...MAIN, syncEnabled: false })
    ).toBe(false);
  });

  it("defers in note windows (main window pulls)", () => {
    expect(
      shouldRunAutoSync([true, false], { ...MAIN, windowType: "note" })
    ).toBe(false);
  });

  it("defers in settings windows", () => {
    expect(
      shouldRunAutoSync([true, false], { ...MAIN, windowType: "settings" })
    ).toBe(false);
  });

  it("still runs on the main window when windowType is 'main'", () => {
    expect(
      shouldRunAutoSync([true, false], { ...MAIN, windowType: "main" })
    ).toBe(true);
  });
});