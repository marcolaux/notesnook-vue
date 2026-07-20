/**
 * Updater helpers (Phase 6.2 — control slice) — pure utilities for the
 * updater store. No bridge import, no side effects → unit-testable in
 * isolation, mirroring `utils/sync.ts` / `utils/vault.ts` / `utils/backup.ts`.
 *
 * The {@link UpdateStatus} shape mirrors the main-process `UpdaterServer`
 * contract (`@contracts/router`); the store round-trips it over the tRPC
 * bridge. These helpers turn that snapshot into user-facing state/labels
 * (English; i18n = Phase 7.1).
 */
import type { UpdateStatus } from "@contracts/router";

/** Coarse updater phase, derived from a status snapshot. */
export type UpdatePhase =
  | "up-to-date"
  | "available"
  | "downloading"
  | "ready"
  | "unknown";

/** Classify a status snapshot into a phase. Pure. */
export function classifyUpdatePhase(status: UpdateStatus | null | undefined): UpdatePhase {
  if (!status) return "unknown";
  if (status.downloaded) return "ready";
  if (status.progress > 0 && status.progress < 100) return "downloading";
  if (status.available) return "available";
  if (status.version === null) return "unknown";
  return "up-to-date";
}

/** User-facing label for a status snapshot (English; i18n = Phase 7.1). Pure. */
export function updateStatusText(status: UpdateStatus | null | undefined): string {
  const phase = classifyUpdatePhase(status);
  switch (phase) {
    case "ready":
      return status?.version ? `Ready to install (v${status.version})` : "Ready to install";
    case "downloading":
      return `Downloading… (${status?.progress ?? 0}%)`;
    case "available":
      return status?.version ? `Update available (v${status.version})` : "Update available";
    case "up-to-date":
      return "Up to date";
    case "unknown":
    default:
      return "Checking for updates…";
  }
}

/** An update is available but not yet downloaded (the "Download" button gate). */
export function isUpdateAvailable(status: UpdateStatus | null | undefined): boolean {
  return classifyUpdatePhase(status) === "available";
}

/** A downloaded update is waiting to be installed (the "Install" button gate). */
export function isReadyToInstall(status: UpdateStatus | null | undefined): boolean {
  return classifyUpdatePhase(status) === "ready";
}