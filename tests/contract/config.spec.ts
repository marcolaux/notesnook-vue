// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  useConfigStore,
  CONFIG_PREFIX,
  CONFIG_DEFAULTS,
  ImageCompressionOptions
} from "@/stores/config";

// The config store reads the per-account default-template keys via
// `getCurrentContext()` from bootstrap; mock it so the real (heavy) bootstrap
// module graph never loads in the headless test env. Current context is fixed
// to "local" so the per-account keys are `notesnook.config.defaultNoteTemplate.local`.
vi.mock("@/platform/bootstrap", () => ({ getCurrentContext: () => "local" }));

// Map-backed localStorage mock (node has none). Scoped to this file (vitest
// auto-isolates per test file). Mirrors the settings.spec.ts approach.
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

describe("config store", () => {
  let storage: MemStorage;

  beforeEach(() => {
    setActivePinia(createPinia());
    storage = new MemStorage();
    (globalThis as { localStorage?: MemStorage }).localStorage = storage;
  });

  it("defaults when localStorage is empty", () => {
    const c = useConfigStore();
    expect(c.syncEnabled).toBe(true);
    expect(c.autoSyncEnabled).toBe(true);
    expect(c.isRealtimeSyncEnabled).toBe(true);
    expect(c.fullOfflineMode).toBe(false);
    expect(c.encryptBackups).toBe(false);
    expect(c.backupReminderOffset).toBe(0);
    expect(c.fullBackupReminderOffset).toBe(0);
    expect(c.backupDirectory).toBeNull();
    expect(c.backupRetentionCount).toBe(5);
    expect(c.doubleSpacedLines).toBe(true);
    expect(c.markdownShortcuts).toBe(false);
    expect(c.fontLigatures).toBe(false);
    expect(c.hideNoteTitle).toBe(false);
    expect(c.homepage).toEqual({ type: "route", id: "notes" });
    expect(c.imageCompression).toBe(ImageCompressionOptions.ASK_EVERY_TIME);
  });

  it("persists + re-reads backupDirectory path", () => {
    const c = useConfigStore();
    c.setBackupDirectory("/Users/test/Backups");
    expect(c.backupDirectory).toBe("/Users/test/Backups");
    expect(storage.getItem(CONFIG_PREFIX + "backupDirectory")).toBe(
      JSON.stringify("/Users/test/Backups")
    );

    setActivePinia(createPinia());
    expect(useConfigStore().backupDirectory).toBe("/Users/test/Backups");
  });

  it("backupRetentionCount defaults to 5 + setter clamps to min 1 + persists", () => {
    const c = useConfigStore();
    expect(c.backupRetentionCount).toBe(5);
    c.setBackupRetentionCount(3);
    expect(c.backupRetentionCount).toBe(3);
    expect(storage.getItem(CONFIG_PREFIX + "backupRetentionCount")).toBe("3");
    // Below 1 clamps to 1 (rotation must never delete the just-written backup).
    c.setBackupRetentionCount(0);
    expect(c.backupRetentionCount).toBe(1);
    c.setBackupRetentionCount(-5);
    expect(c.backupRetentionCount).toBe(1);
    // Fractional input is floored.
    c.setBackupRetentionCount(4.9);
    expect(c.backupRetentionCount).toBe(4);
    // Persists across a re-read.
    setActivePinia(createPinia());
    expect(useConfigStore().backupRetentionCount).toBe(4);
  });

  it("persists + re-reads a boolean toggle (write-through)", () => {
    const c = useConfigStore();
    c.setSyncEnabled(false);
    expect(c.syncEnabled).toBe(false);
    // Persisted under the namespaced key as JSON.
    expect(storage.getItem(CONFIG_PREFIX + "syncEnabled")).toBe("false");

    // A fresh store instance (new pinia) reads the persisted value.
    setActivePinia(createPinia());
    const c2 = useConfigStore();
    expect(c2.syncEnabled).toBe(false);
  });

  it("persists + re-reads a number (backup reminder offset)", () => {
    const c = useConfigStore();
    c.setBackupReminderOffset(2);
    expect(c.backupReminderOffset).toBe(2);
    expect(storage.getItem(CONFIG_PREFIX + "backupReminderOffset")).toBe("2");

    setActivePinia(createPinia());
    expect(useConfigStore().backupReminderOffset).toBe(2);
  });

  it("persists + re-reads an object (homepage)", () => {
    const c = useConfigStore();
    c.setHomepage({ type: "notebook", id: "abc" });
    expect(c.homepage).toEqual({ type: "notebook", id: "abc" });
    expect(storage.getItem(CONFIG_PREFIX + "homepage")).toBe(
      JSON.stringify({ type: "notebook", id: "abc" })
    );

    setActivePinia(createPinia());
    expect(useConfigStore().homepage).toEqual({ type: "notebook", id: "abc" });
  });

  it("defaults tocMode to 'toc' + persists the last-used mode", () => {
    const c = useConfigStore();
    expect(c.tocMode).toBe("toc");
    c.setTocMode("minimap");
    expect(c.tocMode).toBe("minimap");
    expect(storage.getItem(CONFIG_PREFIX + "tocMode")).toBe(JSON.stringify("minimap"));

    // A freshly-constructed store (e.g. a new window) re-reads the last-used mode.
    setActivePinia(createPinia());
    expect(useConfigStore().tocMode).toBe("minimap");
  });

  it("load() re-reads every value from localStorage", () => {
    const c = useConfigStore();
    // Construction read defaults (localStorage empty).
    expect(c.fullOfflineMode).toBe(false);
    expect(c.encryptBackups).toBe(false);

    // Another window writes to localStorage after this store was constructed.
    storage.setItem(CONFIG_PREFIX + "fullOfflineMode", "true");
    storage.setItem(CONFIG_PREFIX + "encryptBackups", "true");
    storage.setItem(CONFIG_PREFIX + "imageCompression", String(ImageCompressionOptions.DISABLE));

    // The refs are still the construction-time values until load() re-reads.
    expect(c.fullOfflineMode).toBe(false);
    c.load();
    expect(c.fullOfflineMode).toBe(true);
    expect(c.encryptBackups).toBe(true);
    expect(c.imageCompression).toBe(ImageCompressionOptions.DISABLE);
  });

  it("falls back to defaults on corrupt JSON in localStorage", () => {
    storage.setItem(CONFIG_PREFIX + "syncEnabled", "{not json");
    const c = useConfigStore();
    expect(c.syncEnabled).toBe(CONFIG_DEFAULTS.syncEnabled);
  });
});

describe("config store — per-account template keys", () => {
  const HEX = "a1b2c3d4e5f60718";
  let storage: MemStorage;

  beforeEach(() => {
    setActivePinia(createPinia());
    storage = new MemStorage();
    (globalThis as { localStorage?: MemStorage }).localStorage = storage;
  });

  it("device-global keys stay un-suffixed (regression: syncEnabled)", () => {
    const c = useConfigStore();
    c.setSyncEnabled(false);
    expect(storage.getItem(CONFIG_PREFIX + "syncEnabled")).toBe("false");
    expect(storage.getItem(CONFIG_PREFIX + "syncEnabled.local")).toBeNull();
  });

  it("setDefaultNoteTemplate writes to the ctx-suffixed key", () => {
    const c = useConfigStore();
    c.setDefaultNoteTemplate("tmpl-1");
    expect(storage.getItem(CONFIG_PREFIX + "defaultNoteTemplate.local")).toBe(
      JSON.stringify("tmpl-1")
    );
    expect(storage.getItem(CONFIG_PREFIX + "defaultNoteTemplate")).toBeNull();
  });

  it("setDefaultTaskTemplate writes to the ctx-suffixed key", () => {
    const c = useConfigStore();
    c.setDefaultTaskTemplate("task-tmpl");
    expect(storage.getItem(CONFIG_PREFIX + "defaultTaskTemplate.local")).toBe(
      JSON.stringify("task-tmpl")
    );
  });

  it("reads a legacy un-suffixed template value (upgrade fallback) + migrates it", () => {
    storage.setItem(CONFIG_PREFIX + "defaultNoteTemplate", JSON.stringify("legacy-tmpl"));
    const c = useConfigStore();
    expect(c.defaultNoteTemplate).toBe("legacy-tmpl");
    // loadClientPrefs migrates the legacy value into the ctx key.
    c.loadClientPrefs("local");
    expect(storage.getItem(CONFIG_PREFIX + "defaultNoteTemplate.local")).toBe(
      JSON.stringify("legacy-tmpl")
    );
  });

  it("loadClientPrefs(ctx) re-reads that ctx's templates into the refs", () => {
    const c = useConfigStore();
    storage.setItem(CONFIG_PREFIX + "defaultNoteTemplate." + HEX, JSON.stringify("hex-note"));
    storage.setItem(CONFIG_PREFIX + "defaultTaskTemplate." + HEX, JSON.stringify("hex-task"));
    c.loadClientPrefs(HEX);
    expect(c.defaultNoteTemplate).toBe("hex-note");
    expect(c.defaultTaskTemplate).toBe("hex-task");
  });

  it("per-account isolation: setting local does not leak to another ctx", () => {
    const c = useConfigStore();
    c.setDefaultNoteTemplate("local-tmpl");
    expect(storage.getItem(CONFIG_PREFIX + "defaultNoteTemplate." + HEX)).toBeNull();
  });
});