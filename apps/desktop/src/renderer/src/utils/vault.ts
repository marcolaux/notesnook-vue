import { VAULT_ERRORS } from "@notesnook-vue/contracts";

/**
 * Vault helpers (Phase 6.3) — pure utilities for the vault store. No database
 * import, no side effects → unit-testable in isolation, mirroring
 * `utils/properties.ts` / `utils/status.ts`.
 *
 * `@notesnook/core`'s `Vault` API throws `new Error(VAULT_ERRORS.<code>)` with
 * the codes `ERR_NO_VAULT` / `ERR_VAULT_LOCKED` / `ERR_WRONG_PASSWORD`
 * (verified in `vendor/notesnook/packages/core/src/api/vault.ts`). These helpers
 * classify a thrown value into a stable code the store can expose reactively,
 * and map it to a user-facing message. i18n is deferred to Phase 7.1 — English
 * only for now, matching the other utils.
 */

export type VaultErrorCode =
  | "noVault"
  | "vaultLocked"
  | "wrongPassword"
  | "unknown";

/** User-facing message per vault error code (English; i18n = Phase 7.1). */
export const VAULT_ERROR_MESSAGES: Record<VaultErrorCode, string> = {
  noVault: "No vault has been created yet.",
  vaultLocked: "Vault is locked. Unlock it first.",
  wrongPassword: "Wrong password.",
  unknown: "Vault operation failed."
};

/** Classify a thrown value into a stable {@link VaultErrorCode} by matching the
 * error message against `VAULT_ERRORS`' code strings. Anything that isn't a
 * known vault error → `"unknown"`. Never throws. */
export function classifyVaultError(e: unknown): VaultErrorCode {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (msg.includes(VAULT_ERRORS.noVault)) return "noVault";
  if (msg.includes(VAULT_ERRORS.vaultLocked)) return "vaultLocked";
  if (msg.includes(VAULT_ERRORS.wrongPassword)) return "wrongPassword";
  return "unknown";
}