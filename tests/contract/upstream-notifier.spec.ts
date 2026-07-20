// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useUpstreamNotifierStore } from "@/stores/upstream-notifier";
import { useSettingsStore } from "@/stores/settings";
import { UPSTREAM_BASELINE } from "@contracts/upstream-baseline.generated";
import { parseReleaseTag } from "@contracts/upstream-semver";
import type { UpstreamReleaseStatus } from "@contracts/router";

const BASELINE = UPSTREAM_BASELINE.baselineTag;

function bumpPatch(tag: string): string {
  const p = parseReleaseTag(tag)!;
  return `v${p.major}.${p.minor}.${p.patch + 1}`;
}

/** Build a check result with the baked baseline + a given latest tag. */
function statusFor(latestTag: string, isNewer: boolean): UpstreamReleaseStatus {
  return {
    checkedAt: "2026-07-17T00:00:00.000Z",
    baselineTag: BASELINE,
    latestTag,
    latestPublishedAt: "2026-07-16T00:00:00.000Z",
    latestUrl: `https://github.com/streetwriters/notesnook/releases/tag/${latestTag}`,
    isNewer,
    error: null
  };
}

// `vi.hoisted` so the mock factory (hoisted above the spec body) sees the fns.
const { bridge, Notif } = vi.hoisted(() => ({
  bridge: { check: { query: vi.fn() } },
  Notif: vi.fn()
}));

vi.mock("@/platform/desktop-bridge", () => ({
  desktop: { upstreamChecker: bridge }
}));

function resetBridge(): void {
  bridge.check.query.mockReset();
}

describe("useUpstreamNotifierStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetBridge();
    vi.stubGlobal("Notification", Notif);
    Notif.mockReset();
  });

  it("starts with no status and hasNewer=false", () => {
    const u = useUpstreamNotifierStore();
    expect(u.status).toBeNull();
    expect(u.hasNewer).toBe(false);
    expect(u.busy).toBe(false);
  });

  it("maybeCheck skips when the privacy toggle is off (no bridge call)", async () => {
    const settings = useSettingsStore();
    settings.setUpstreamReleaseCheckEnabled(false);
    const u = useUpstreamNotifierStore();
    const ok = await u.maybeCheck();
    expect(ok).toBe(false);
    expect(bridge.check.query).not.toHaveBeenCalled();
  });

  it("notifies + sets hasNewer when a newer release is found", async () => {
    const newer = bumpPatch(BASELINE);
    bridge.check.query.mockResolvedValue(statusFor(newer, true));
    const u = useUpstreamNotifierStore();
    const ok = await u.maybeCheck();
    expect(ok).toBe(true);
    expect(u.status?.latestTag).toBe(newer);
    expect(u.hasNewer).toBe(true);
    expect(Notif).toHaveBeenCalledTimes(1);
    expect(Notif.mock.calls[0][1]?.body).toContain(newer);
  });

  it("does not notify when the latest equals the baseline", async () => {
    bridge.check.query.mockResolvedValue(statusFor(BASELINE, false));
    const u = useUpstreamNotifierStore();
    await u.maybeCheck();
    expect(u.hasNewer).toBe(false);
    expect(Notif).not.toHaveBeenCalled();
  });

  it("throttles: a second check within 24h does not call the bridge", async () => {
    const newer = bumpPatch(BASELINE);
    bridge.check.query.mockResolvedValue(statusFor(newer, true));
    const u = useUpstreamNotifierStore();
    await u.maybeCheck();
    expect(bridge.check.query).toHaveBeenCalledTimes(1);
    const ok = await u.maybeCheck(); // throttled
    expect(ok).toBe(false);
    expect(bridge.check.query).toHaveBeenCalledTimes(1); // still once
  });

  it("checkNow(force) bypasses the throttle", async () => {
    const newer = bumpPatch(BASELINE);
    bridge.check.query.mockResolvedValue(statusFor(newer, true));
    const u = useUpstreamNotifierStore();
    await u.maybeCheck();
    await u.maybeCheck(true); // force
    expect(bridge.check.query).toHaveBeenCalledTimes(2);
  });

  it("notifies at most once per tag (no re-notify on a throttled-skipped recheck)", async () => {
    const newer = bumpPatch(BASELINE);
    bridge.check.query.mockResolvedValue(statusFor(newer, true));
    const u = useUpstreamNotifierStore();
    await u.maybeCheck();
    await u.maybeCheck(true); // force a second network check for the same tag
    expect(Notif).toHaveBeenCalledTimes(1);
  });

  it("dismiss() hides the indicator until a newer tag arrives", async () => {
    const newer = bumpPatch(BASELINE);
    bridge.check.query.mockResolvedValue(statusFor(newer, true));
    const u = useUpstreamNotifierStore();
    await u.maybeCheck();
    expect(u.hasNewer).toBe(true);
    u.dismiss();
    expect(u.hasNewer).toBe(false);
    // A newer tag re-shows the indicator + re-notifies.
    const newer2 = bumpPatch(newer);
    bridge.check.query.mockResolvedValue(statusFor(newer2, true));
    await u.maybeCheck(true);
    expect(u.hasNewer).toBe(true);
    expect(Notif).toHaveBeenCalledTimes(2);
  });

  it("never throws on bridge error (sets lastError, returns false)", async () => {
    bridge.check.query.mockRejectedValue(new Error("offline"));
    const u = useUpstreamNotifierStore();
    const ok = await u.maybeCheck();
    expect(ok).toBe(false);
    expect(u.lastError).toBe("offline");
    expect(u.hasNewer).toBe(false);
  });
});