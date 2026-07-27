/**
 * Updater helpers (Phase 6.2 — control slice) — pure utilities for the
 * updater store. No bridge import, no side effects → unit-testable in
 * isolation, mirroring `utils/sync.ts` / `utils/vault.ts` / `utils/backup.ts`.
 *
 * The {@link UpdateStatus} shape mirrors the main-process `UpdaterServer`
 * contract (`@contracts/router`); the store round-trips it over the tRPC
 * bridge. These helpers turn that snapshot into user-facing state/labels via
 * `i18n.global.t` (the store reads them on each tick / render).
 */
import type { UpdateStatus } from "@contracts/router";
import i18n from "@/i18n";

const t = i18n.global.t.bind(i18n.global);

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

/** User-facing label for a status snapshot. Pure. */
export function updateStatusText(status: UpdateStatus | null | undefined): string {
  const phase = classifyUpdatePhase(status);
  switch (phase) {
    case "ready":
      return status?.version
        ? t("updater.readyToInstallVersion", { version: status.version })
        : t("updater.readyToInstall");
    case "downloading":
      return t("updater.downloading", { progress: status?.progress ?? 0 });
    case "available":
      return status?.version
        ? t("updater.updateAvailableVersion", { version: status.version })
        : t("updater.updateAvailable");
    case "up-to-date":
      return t("updater.upToDate");
    case "unknown":
    default:
      return t("updater.checking");
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