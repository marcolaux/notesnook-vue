/**
 * Contract tests for the shared server-config + account-registry schemas
 * (`contracts/server-config.ts`). These validate the payloads that cross the
 * main↔renderer tRPC bridge for the account registry (the multi-account
 * switcher's source of truth). A malformed stored config must not crash the
 * switcher — zod rejects it at the bridge boundary.
 */
import { describe, it, expect } from "vitest";
import { ServerConfigSchema, AccountEntrySchema } from "@contracts/server-config";

describe("ServerConfigSchema", () => {
  it("accepts the notesnook default profile", () => {
    expect(ServerConfigSchema.parse({ profile: "notesnook" })).toEqual({ profile: "notesnook" });
  });
  it("accepts a custom profile with a host bag", () => {
    const custom = { profile: "custom", hosts: { API_HOST: "https://api.example.com", AUTH_HOST: "https://auth.example.com" } };
    expect(ServerConfigSchema.parse(custom)).toEqual(custom);
  });
  it("rejects an unknown profile", () => {
    expect(() => ServerConfigSchema.parse({ profile: "self-host" })).toThrow();
  });
  it("rejects a custom profile whose hosts is not a string record", () => {
    expect(() => ServerConfigSchema.parse({ profile: "custom", hosts: { API_HOST: 123 } })).toThrow();
    expect(() => ServerConfigSchema.parse({ profile: "custom" })).toThrow();
  });
});

describe("AccountEntrySchema", () => {
  const base = {
    contextId: "abc123def456",
    email: "user@example.com",
    serverConfig: { profile: "notesnook" },
    lastUsed: 1700000000000
  };
  it("accepts a complete entry (label optional)", () => {
    expect(AccountEntrySchema.parse(base)).toEqual(base);
    expect(AccountEntrySchema.parse({ ...base, label: "Work" })).toEqual({ ...base, label: "Work" });
  });
  it("accepts a custom-server entry", () => {
    const entry = { ...base, serverConfig: { profile: "custom", hosts: { API_HOST: "https://api.example.com" } } };
    expect(AccountEntrySchema.parse(entry)).toEqual(entry);
  });
  it("rejects an entry missing required fields", () => {
    expect(() => AccountEntrySchema.parse({ ...base, email: undefined })).toThrow();
    expect(() => AccountEntrySchema.parse({ ...base, contextId: undefined })).toThrow();
    expect(() => AccountEntrySchema.parse({ ...base, lastUsed: undefined })).toThrow();
  });
  it("rejects an entry with an invalid serverConfig", () => {
    expect(() => AccountEntrySchema.parse({ ...base, serverConfig: { profile: "nope" } })).toThrow();
  });
});