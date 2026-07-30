// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildManifest } from "@/utils/backup";

// Hoisted fakes so the hoisted `vi.mock` factories can close over them (no TDZ).
const mocks = vi.hoisted(() => {
  const backupFs = {
    listDir: { query: vi.fn(async () => [] as string[]) },
    exists: { query: vi.fn(async () => false) },
    readFileText: { query: vi.fn(async () => "") },
    readFileBytes: { query: vi.fn(async () => new Uint8Array()) },
    writeFileText: { mutate: vi.fn(async () => {}) },
    writeFileBytes: { mutate: vi.fn(async () => {}) },
    ensureDir: { mutate: vi.fn(async () => {}) },
    deleteFile: { mutate: vi.fn(async () => {}) },
    removeDir: { mutate: vi.fn(async () => {}) }
  };
  return { desktop: { backupFs }, retention: { current: 2 } };
});

vi.mock("@/platform/desktop-bridge", () => ({ desktop: mocks.desktop }));
vi.mock("@/stores/config", () => ({
  useConfigStore: () => ({ backupRetentionCount: mocks.retention.current })
}));
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => ({}),
  getCurrentContext: () => "local",
  resolveHostsForContext: vi.fn()
}));
vi.mock("@/platform/database", () => ({
  createDesktopPlatform: vi.fn(),
  initDatabase: vi.fn()
}));
vi.mock("@/platform/local-user", () => ({ ensureLocalUser: vi.fn() }));
vi.mock("@/platform/account-registry", () => ({
  listAccounts: vi.fn(),
  getAccount: vi.fn()
}));
vi.mock("@/platform/fs", () => ({ readAttachmentStream: vi.fn(), writeAttachmentBytes: vi.fn() }));

import { gcAttachments } from "@/stores/auto-backup";

const ROOT = "/tmp/nn-backup-root";
const SAN = "local";

describe("gcAttachments (mark-and-sweep)", () => {
  beforeEach(() => {
    mocks.retention.current = 2;
    mocks.desktop.backupFs.listDir.query.mockClear();
    mocks.desktop.backupFs.readFileText.query.mockClear();
    mocks.desktop.backupFs.deleteFile.mutate.mockClear();
  });

  it("deletes only pool blobs not referenced by any retained manifest", async () => {
    // Pool has h1,h2,h3; two retained full dirs reference h1 and h2.
    mocks.desktop.backupFs.listDir.query.mockImplementation(async ({ path }) => {
      if (path === `${SAN}/attachments`) return ["h1", "h2", "h3"];
      if (path === `${SAN}/full`) return ["2024-01-02-00-00-00-full", "2024-01-01-00-00-00-full"];
      return [];
    });
    mocks.desktop.backupFs.readFileText.query.mockImplementation(async ({ path }) => {
      if (path.endsWith("2024-01-01-00-00-00-full/attachments/manifest.json"))
        return buildManifest(["h1"]);
      if (path.endsWith("2024-01-02-00-00-00-full/attachments/manifest.json"))
        return buildManifest(["h2"]);
      throw new Error("ENOENT");
    });

    await gcAttachments(ROOT, SAN);

    const deleted = mocks.desktop.backupFs.deleteFile.mutate.mock.calls.map(
      (c) => (c[0] as { path: string }).path
    );
    expect(deleted).toEqual([`${SAN}/attachments/h3`]);
  });

  it("tolerates a retained old-layout dir (no manifest) — contributes no references", async () => {
    mocks.desktop.backupFs.listDir.query.mockImplementation(async ({ path }) => {
      if (path === `${SAN}/attachments`) return ["h1", "h2"];
      if (path === `${SAN}/full`) return ["2024-01-01-00-00-00-full"];
      return [];
    });
    mocks.desktop.backupFs.readFileText.query.mockImplementation(async () => {
      throw new Error("ENOENT"); // no manifest
    });

    await gcAttachments(ROOT, SAN);

    const deleted = mocks.desktop.backupFs.deleteFile.mutate.mock.calls.map(
      (c) => (c[0] as { path: string }).path
    );
    expect(deleted.sort()).toEqual([`${SAN}/attachments/h1`, `${SAN}/attachments/h2`]);
  });

  it("deletes nothing when every pool blob is referenced", async () => {
    mocks.desktop.backupFs.listDir.query.mockImplementation(async ({ path }) => {
      if (path === `${SAN}/attachments`) return ["h1", "h2"];
      if (path === `${SAN}/full`) return ["2024-01-01-00-00-00-full"];
      return [];
    });
    mocks.desktop.backupFs.readFileText.query.mockImplementation(async () =>
      buildManifest(["h1", "h2"])
    );

    await gcAttachments(ROOT, SAN);

    expect(mocks.desktop.backupFs.deleteFile.mutate).not.toHaveBeenCalled();
  });

  it("no-ops when the pool is empty", async () => {
    mocks.desktop.backupFs.listDir.query.mockImplementation(async ({ path }) => {
      if (path === `${SAN}/attachments`) return [];
      if (path === `${SAN}/full`) return ["2024-01-01-00-00-00-full"];
      return [];
    });
    await gcAttachments(ROOT, SAN);
    expect(mocks.desktop.backupFs.deleteFile.mutate).not.toHaveBeenCalled();
    // retainedFullDirs still ran (listDir on full), but no manifest read needed.
    expect(mocks.desktop.backupFs.readFileText.query).not.toHaveBeenCalled();
  });
});