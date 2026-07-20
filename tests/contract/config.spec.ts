// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  useConfigStore,
  CONFIG_PREFIX,
  CONFIG_DEFAULTS,
  ImageCompressionOptions
} from "@/stores/config";

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
    expect(c.doubleSpacedLines).toBe(true);
    expect(c.markdownShortcuts).toBe(false);
    expect(c.fontLigatures).toBe(false);
    expect(c.hideNoteTitle).toBe(false);
    expect(c.homepage).toEqual({ type: "route", id: "notes" });
    expect(c.imageCompression).toBe(ImageCompressionOptions.ASK_EVERY_TIME);
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