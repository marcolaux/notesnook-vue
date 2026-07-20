/**
 * Contract tests for the account-context helpers (`account-context.ts`).
 *
 * These are the pure, headless-tested functions that derive per-context names
 * (SQLite file, IndexedDB, attachments dir, keychain key) and the current-
 * context pointer. The per-account DB architecture depends on these being
 * deterministic and stable; the login flow keys an account's DB off
 * `hashEmail`, so a regression here would split or merge accounts silently.
 *
 * `hashEmail` uses Web Crypto (`crypto.subtle.digest`), available in the node
 * test env (Node 20+). The localStorage-backed `read/writeCurrentContext` uses
 * the same in-memory shim the other contract tests install.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  hashEmail,
  isLocal,
  LOCAL_CONTEXT,
  dbFileName,
  indexedDBName,
  attachmentsDirName,
  keychainKey,
  readCurrentContext,
  writeCurrentContext,
  shouldMigrateLegacyToLocal,
  CURRENT_CONTEXT_KEY
} from "@/platform/account-context";

class MemLocalStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
  clear(): void { this.m.clear(); }
}

let savedLocalStorage: unknown;

beforeEach(() => {
  savedLocalStorage = (globalThis as unknown as { localStorage?: unknown }).localStorage;
  (globalThis as unknown as { localStorage: MemLocalStorage }).localStorage = new MemLocalStorage();
});

afterEach(() => {
  (globalThis as unknown as { localStorage?: unknown }).localStorage = savedLocalStorage;
});

describe("account-context", () => {
  describe("hashEmail", () => {
    it("is deterministic (same email → same context id)", async () => {
      const a = await hashEmail("user@example.com");
      const b = await hashEmail("user@example.com");
      expect(a).toBe(b);
    });

    it("normalises case + surrounding whitespace so they map to one account", async () => {
      const a = await hashEmail("User@Example.com");
      const b = await hashEmail("  user@example.com  ");
      expect(a).toBe(b);
    });

    it("produces different ids for different emails (collision-free)", async () => {
      const a = await hashEmail("alice@example.com");
      const b = await hashEmail("bob@example.com");
      expect(a).not.toBe(b);
    });

    it("yields a 16-hex-char id (filename-safe, no account vs local clash)", async () => {
      const id = await hashEmail("x@y.z");
      expect(id).toMatch(/^[0-9a-f]{16}$/);
      // An account id must never equal the local context id.
      expect(id).not.toBe(LOCAL_CONTEXT);
    });
  });

  describe("isLocal", () => {
    it("is true for the local context id", () => {
      expect(isLocal(LOCAL_CONTEXT)).toBe(true);
    });
    it("is false for an account context id", async () => {
      expect(isLocal(await hashEmail("a@b.com"))).toBe(false);
    });
  });

  describe("per-context name derivations", () => {
    it("derives the SQLite filename (main appends `.sql`)", async () => {
      expect(dbFileName(LOCAL_CONTEXT)).toBe("notesnook-local");
      const id = await hashEmail("a@b.com");
      expect(dbFileName(id)).toBe(`notesnook-${id}`);
    });

    it("derives the NNStorage IndexedDB name", async () => {
      expect(indexedDBName(LOCAL_CONTEXT)).toBe("Notesnook-local");
      const id = await hashEmail("a@b.com");
      expect(indexedDBName(id)).toBe(`Notesnook-${id}`);
    });

    it("derives the attachments dir name (Phase 3)", async () => {
      expect(attachmentsDirName(LOCAL_CONTEXT)).toBe("attachments-local");
      const id = await hashEmail("a@b.com");
      expect(attachmentsDirName(id)).toBe(`attachments-${id}`);
    });

    it("derives per-context keychain keys (databaseKey, userEncryptionKey, …)", () => {
      expect(keychainKey("databaseKey", LOCAL_CONTEXT)).toBe("databaseKey:local");
      expect(keychainKey("userEncryptionKey", "abcd1234")).toBe("userEncryptionKey:abcd1234");
    });
  });

  describe("current-context pointer", () => {
    it("defaults to local when nothing is persisted", () => {
      expect(readCurrentContext()).toBe(LOCAL_CONTEXT);
    });

    it("round-trips a written account context", async () => {
      const id = await hashEmail("a@b.com");
      writeCurrentContext(id);
      expect(readCurrentContext()).toBe(id);
    });

    it("falls back to local on a blank value", () => {
      localStorage.setItem(CURRENT_CONTEXT_KEY, "   ");
      expect(readCurrentContext()).toBe(LOCAL_CONTEXT);
    });
  });

  describe("legacy → local migration decision", () => {
    it("migrates when the local file is absent but the legacy file exists", () => {
      expect(shouldMigrateLegacyToLocal(false, true)).toBe(true);
    });
    it("does not migrate when the local file already exists", () => {
      expect(shouldMigrateLegacyToLocal(true, true)).toBe(false);
      expect(shouldMigrateLegacyToLocal(true, false)).toBe(false);
    });
    it("does not migrate when there is no legacy file (fresh install)", () => {
      expect(shouldMigrateLegacyToLocal(false, false)).toBe(false);
    });
  });
});