/**
 * Server-config contract (pure) — which Notesnook servers an account talks to.
 *
 * Shared by main (which stores the per-account config opaquely in
 * `userData/accounts.json`) and the renderer (which resolves the concrete host
 * URLs via `platform/server-config.ts`). Lives in `contracts/` so the type +
 * zod schema are the single source of truth for the `AccountRegistryServer`
 * payloads, and so they type-check under BOTH the main-process and renderer
 * tsconfigs (the contract module must stay free of renderer-only imports).
 *
 * The `custom` profile's `hosts` is a `Record<string, string>` here (not the
 * renderer's narrower `typeof hosts`) so the contract does not depend on the
 * vendored `@notesnook-vue/contracts` `hosts` value (which is not in the main
 * bundle's type graph). The renderer's `Hosts = typeof hosts` is assignable to
 * this looser shape on the way in, and the renderer casts back on the way out
 * (it re-validates via `isValidConfig`/`isHosts` before use).
 */
import { z } from "zod";

export type ServerProfile = "notesnook" | "custom";

/** Default Notesnook servers — no customisation. */
export interface NotesnookProfile {
  profile: "notesnook";
}

/** Self-hosted / custom servers — one URL per component. */
export interface CustomProfile {
  profile: "custom";
  hosts: Record<string, string>;
}

export type ServerConfig = NotesnookProfile | CustomProfile;

/** Zod schema for a `ServerConfig` payload crossing the bridge. Used by the
 *  account-registry procedures to validate stored/received configs. */
export const ServerConfigSchema = z.union([
  z.object({ profile: z.literal("notesnook") }),
  z.object({ profile: z.literal("custom"), hosts: z.record(z.string(), z.string()) })
]);

/** One known account in the multi-account registry. `hashEmail` is one-way, so
 *  the email is stored explicitly for the switcher's display label. The
 *  per-account `serverConfig` lets an upstream-notesnook account and a
 *  self-hosted account coexist in the list. `"local"` is implicit (never
 *  listed — it is always available and not removable). */
export interface AccountEntry {
  /** `hashEmail(email)` — identifies the per-context encrypted SQLite DB. */
  contextId: string;
  /** The account email (display label; `hashEmail` is one-way). */
  email: string;
  /** Per-account server profile (notesnook | custom). */
  serverConfig: ServerConfig;
  /** Optional display name / host tag for the switcher. */
  label?: string | undefined;
  /** Epoch ms of last use — the switcher orders accounts by recency. */
  lastUsed: number;
}

/** Zod input for `accountRegistry.upsert`. */
export const AccountEntrySchema = z.object({
  contextId: z.string(),
  email: z.string(),
  serverConfig: ServerConfigSchema,
  label: z.string().optional(),
  lastUsed: z.number()
});

export type AccountRegistry = { accounts: AccountEntry[] };